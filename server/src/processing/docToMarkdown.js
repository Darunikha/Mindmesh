/**
 * Converts TipTap/ProseMirror JSON (the format notes are stored in) to Markdown, so notes
 * can be taken out of Mindmesh as plain, portable text. The reverse of markdownToDoc.js.
 * Markdown has no underline, so underlined text is exported as plain text.
 */
const SAFE_HREF = /^(https?:|mailto:|\/)/i;

/** Escapes characters that would be read as formatting. Not applied to code. */
function escapeText(text) {
  return text.replace(/([\\`*_[\]<])/g, '\\$1');
}

/** Block-level markers at the start of a paragraph ("# ", "> ", "- ", "1. ") must not become structure. */
function escapeBlockStart(text) {
  return text.replace(/^(\s*)(#{1,6}(?=\s)|>|[-+*](?=\s)|\d+[.)](?=\s))/, '$1\\$2');
}

/** Wraps text in a marker, keeping edge whitespace outside it ("** a **" is not valid Markdown). */
function wrap(text, marker) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : text;
}

function longestRun(text, ch) {
  return Math.max(0, ...(text.match(new RegExp(`${ch === '`' ? '`' : ch}+`, 'g')) || []).map((s) => s.length));
}

function inline(nodes = []) {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text') return inline(n.content || []);
      const marks = new Set((n.marks || []).map((m) => m.type));
      let out;
      if (marks.has('code')) {
        const fence = '`'.repeat(longestRun(n.text, '`') + 1);
        out = `${fence}${n.text.startsWith('`') || n.text.endsWith('`') ? ` ${n.text} ` : n.text}${fence}`;
      } else {
        out = escapeText(n.text);
      }
      if (marks.has('strike')) out = wrap(out, '~~');
      if (marks.has('italic')) out = wrap(out, '*');
      if (marks.has('bold')) out = wrap(out, '**');
      const link = (n.marks || []).find((m) => m.type === 'link');
      if (link && SAFE_HREF.test(link.attrs?.href || '')) out = `[${out}](${link.attrs.href.replace(/[()\s]/g, encodeURIComponent)})`;
      return out;
    })
    .join('');
}

function indent(text, prefix, firstPrefix = prefix) {
  return text
    .split('\n')
    .map((line, i) => (line.trim() ? (i === 0 ? firstPrefix : prefix) + line : i === 0 ? firstPrefix.trimEnd() : ''))
    .join('\n');
}

function blocks(nodes = []) {
  return nodes.map(block).filter((b) => b !== '');
}

function block(node) {
  switch (node.type) {
    case 'paragraph':
      return escapeBlockStart(inline(node.content));
    case 'heading':
      return `${'#'.repeat(Math.min(6, node.attrs?.level || 1))} ${inline(node.content).replace(/\s*\n\s*/g, ' ')}`;
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList';
      const start = node.attrs?.start || 1;
      return (node.content || [])
        .map((item, i) => {
          const marker = ordered ? `${start + i}. ` : '- ';
          // A nested list follows its parent line directly (a blank line would make the list "loose").
          let body = '';
          (item.content || []).forEach((child) => {
            const text = block(child);
            if (text === '') return;
            const nested = child.type === 'bulletList' || child.type === 'orderedList';
            body += body ? (nested ? '\n' : '\n\n') + text : text;
          });
          return indent(body, ' '.repeat(marker.length), marker);
        })
        .join('\n');
    }
    case 'blockquote':
      return blocks(node.content)
        .join('\n\n')
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'codeBlock': {
      const code = (node.content || []).map((n) => n.text || '').join('');
      const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1));
      return `${fence}${node.attrs?.language || ''}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    default:
      return node.content ? blocks(node.content).join('\n\n') : inline([node]);
  }
}

export function docToMarkdown(doc) {
  return blocks(doc?.content || []).join('\n\n');
}

/** A complete Markdown file for a note: title, tags, then the body. */
export function noteToMarkdownFile({ title, tags = [], content }) {
  const head = [`# ${String(title).replace(/\s+/g, ' ').trim()}`];
  if (tags.length) head.push(`*Tags: ${tags.join(', ')}*`);
  const body = docToMarkdown(content);
  return `${head.join('\n\n')}\n\n${body}${body ? '\n' : ''}`;
}

/** Makes a safe download filename from a title: letters, digits, dashes. */
export function slugFilename(title, ext = 'md') {
  const slug = String(title || 'untitled')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'untitled'}.${ext}`;
}

/**
 * Helpers for TipTap/ProseMirror JSON note content.
 * The server never renders note HTML. It validates the structure, removes unsafe link
 * targets and derives plain text (with heading context) for search and chunking.
 */

const MAX_DEPTH = 40;
const MAX_NODES = 50000;
const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export class NoteContentError extends Error {}

/** Returns a sanitised deep copy or throws NoteContentError. */
export function sanitizeDoc(doc) {
  if (!doc || typeof doc !== 'object' || doc.type !== 'doc') throw new NoteContentError('Note content must be a document');
  let count = 0;
  const walk = (node, depth) => {
    if (depth > MAX_DEPTH) throw new NoteContentError('Note content is nested too deeply');
    if (++count > MAX_NODES) throw new NoteContentError('Note content is too large');
    if (!node || typeof node !== 'object' || typeof node.type !== 'string' || node.type.length > 40) {
      throw new NoteContentError('Note content contains an invalid node');
    }
    const out = { type: node.type };
    if (node.attrs && typeof node.attrs === 'object') out.attrs = { ...node.attrs };
    if (typeof node.text === 'string') out.text = node.text;
    if (Array.isArray(node.marks)) {
      out.marks = node.marks
        .filter((m) => m && typeof m.type === 'string')
        .filter((m) => m.type !== 'link' || (typeof m.attrs?.href === 'string' && SAFE_HREF.test(m.attrs.href.trim())))
        .map((m) => (m.attrs ? { type: m.type, attrs: { ...m.attrs } } : { type: m.type }));
    }
    if (Array.isArray(node.content)) out.content = node.content.map((c) => walk(c, depth + 1));
    return out;
  };
  return walk(doc, 0);
}

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'blockquote', 'listItem', 'bulletList', 'orderedList', 'taskItem', 'horizontalRule']);

function inlineText(node) {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content || []).map(inlineText).join('');
}

/**
 * Converts a document into heading-scoped text segments:
 * [{ heading: 'Intro', text: 'Intro\n\nParagraph…' }, …]
 */
export function docToSegments(doc) {
  const segments = [];
  let heading = null;
  let lines = [];
  const flush = () => {
    if (lines.join('').trim()) segments.push({ heading, text: lines.join('\n\n') });
    lines = [];
  };

  const visit = (node, prefix = '') => {
    if (!node) return;
    if (node.type === 'heading') {
      flush();
      heading = inlineText(node).trim().slice(0, 300) || null;
      if (heading) lines.push(heading);
      return;
    }
    if (node.type === 'paragraph' || node.type === 'codeBlock') {
      const t = inlineText(node);
      if (t.trim()) lines.push(prefix + t);
      return;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      (node.content || []).forEach((item, i) => {
        const marker = node.type === 'orderedList' ? `${(node.attrs?.start || 1) + i}. ` : '• ';
        (item.content || []).forEach((child, j) => visit(child, j === 0 ? prefix + marker : `${prefix}   `));
      });
      return;
    }
    if (node.type === 'blockquote') {
      (node.content || []).forEach((c) => visit(c, `${prefix}> `));
      return;
    }
    if (BLOCKS.has(node.type) || node.type === 'doc') {
      (node.content || []).forEach((c) => visit(c, prefix));
    } else if (node.content) {
      (node.content || []).forEach((c) => visit(c, prefix));
    }
  };

  visit(doc);
  flush();
  return segments;
}

export function countWords(segments) {
  return segments.reduce((n, s) => n + (s.text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length || 0), 0);
}

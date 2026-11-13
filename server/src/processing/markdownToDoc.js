import { Lexer } from 'marked';

/**
 * Converts Markdown (e.g. an assistant answer) into the TipTap/ProseMirror JSON used by
 * notes, so saved answers become real, editable rich text rather than a block of symbols.
 * Unsupported constructs (tables, raw HTML) degrade to plain paragraphs, never to markup.
 */
const SAFE_HREF = /^(https?:|mailto:|\/)/i;

function inline(tokens = [], marks = []) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.tokens?.length) out.push(...inline(t.tokens, marks));
        else if (t.text) out.push(textNode(decode(t.text), marks));
        break;
      case 'escape':
        out.push(textNode(t.text, marks));
        break;
      case 'strong':
        out.push(...inline(t.tokens, [...marks, { type: 'bold' }]));
        break;
      case 'em':
        out.push(...inline(t.tokens, [...marks, { type: 'italic' }]));
        break;
      case 'del':
        out.push(...inline(t.tokens, [...marks, { type: 'strike' }]));
        break;
      case 'codespan':
        out.push(textNode(decode(t.text), [...marks, { type: 'code' }]));
        break;
      case 'link':
        out.push(...inline(t.tokens, SAFE_HREF.test(t.href) ? [...marks, { type: 'link', attrs: { href: t.href } }] : marks));
        break;
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      default:
        if (t.raw) out.push(textNode(t.raw, marks));
    }
  }
  return out.filter((n) => n.type !== 'text' || n.text);
}

function textNode(text, marks) {
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text };
}

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const paragraph = (content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });

function blocks(tokens = []) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push({ type: 'heading', attrs: { level: Math.min(3, t.depth) }, content: inline(t.tokens) });
        break;
      case 'paragraph':
        out.push(paragraph(inline(t.tokens)));
        break;
      case 'text':
        out.push(paragraph(inline(t.tokens?.length ? t.tokens : [{ type: 'text', text: t.text }])));
        break;
      case 'list':
        out.push({
          type: t.ordered ? 'orderedList' : 'bulletList',
          ...(t.ordered && t.start > 1 ? { attrs: { start: t.start } } : {}),
          content: t.items.map((item) => {
            const inner = blocks(item.tokens);
            return { type: 'listItem', content: inner.length ? inner : [{ type: 'paragraph' }] };
          }),
        });
        break;
      case 'code':
        out.push({ type: 'codeBlock', attrs: { language: t.lang || null }, content: t.text ? [{ type: 'text', text: t.text }] : [] });
        break;
      case 'blockquote':
        out.push({ type: 'blockquote', content: blocks(t.tokens) });
        break;
      case 'hr':
        out.push({ type: 'horizontalRule' });
        break;
      case 'table': {
        const row = (cells) => cells.map((c) => c.text).join(' | ');
        out.push(paragraph([{ type: 'text', text: row(t.header), marks: [{ type: 'bold' }] }]));
        for (const r of t.rows) out.push(paragraph([{ type: 'text', text: row(r) }]));
        break;
      }
      case 'space':
        break;
      default:
        if (t.raw?.trim()) out.push(paragraph([{ type: 'text', text: t.raw.trim() }]));
    }
  }
  return out;
}

export function markdownToDoc(markdown) {
  const content = blocks(new Lexer({ gfm: true }).lex(markdown || ''));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

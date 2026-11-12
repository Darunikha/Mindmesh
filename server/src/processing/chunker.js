/**
 * Splits extracted text into retrieval-sized passages.
 *
 * Strategy: normalise whitespace, break each segment into paragraphs, break oversized
 * paragraphs into sentences (and oversized sentences into hard slices), then pack units
 * greedily up to TARGET characters. Consecutive chunks share ~OVERLAP characters of
 * trailing context so a fact split across a boundary is still retrievable.
 * Page numbers and the nearest heading travel with every unit.
 */
export const CHUNK_TARGET = 1200;
export const CHUNK_MAX = 1800;
export const CHUNK_OVERLAP = 200;

export function normaliseText(text = '') {
  return String(text)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // Re-join words hyphenated across line breaks (common in PDFs).
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const estimateTokens = (s) => Math.ceil(s.length / 4);

function splitLong(text) {
  if (text.length <= CHUNK_MAX) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) || [text];
  const out = [];
  for (const s of sentences) {
    const t = s.trim();
    if (!t) continue;
    if (t.length <= CHUNK_MAX) out.push(t);
    else for (let i = 0; i < t.length; i += CHUNK_TARGET) out.push(t.slice(i, i + CHUNK_TARGET));
  }
  return out;
}

/**
 * @param {{ text: string, page?: number|null, heading?: string|null }[]} segments
 * @returns {{ index, text, page, pageEnd, heading, charCount, tokenEstimate }[]}
 */
export function chunkSegments(segments) {
  const units = [];
  for (const seg of segments) {
    const text = normaliseText(seg.text);
    if (!text) continue;
    for (const para of text.split(/\n\n+/)) {
      for (const piece of splitLong(para.trim())) {
        if (piece) units.push({ text: piece, page: seg.page ?? null, heading: seg.heading ?? null });
      }
    }
  }

  const chunks = [];
  let current = [];
  let size = 0;

  const emit = () => {
    if (!current.length) return;
    const text = current.map((u) => u.text).join('\n\n');
    const pages = current.map((u) => u.page).filter((p) => p != null);
    chunks.push({
      index: chunks.length,
      text,
      page: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null,
      heading: current.find((u) => u.heading)?.heading ?? null,
      charCount: text.length,
      tokenEstimate: estimateTokens(text),
    });
  };

  for (const unit of units) {
    if (size + unit.text.length > CHUNK_TARGET && size > 0) {
      emit();
      // Carry trailing units forward as overlap, as long as they fit in the overlap budget.
      const carried = [];
      let carriedSize = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const u = current[i];
        if (carriedSize + u.text.length > CHUNK_OVERLAP) break;
        carried.unshift(u);
        carriedSize += u.text.length;
      }
      // A new heading starts a clean chunk: don't drag the previous section along.
      current = unit.heading && carried.length && carried[carried.length - 1].heading !== unit.heading ? [] : carried;
      size = current.reduce((n, u) => n + u.text.length, 0);
    }
    current.push(unit);
    size += unit.text.length;
  }
  emit();
  return chunks;
}

export function excerptOf(segments, max = 280) {
  const text = normaliseText(segments.map((s) => s.text).join('\n\n')).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

import { escapeRegex } from '../../utils/validators.js';

/**
 * Query-term highlighting. Terms are lightly stemmed so "learning" also highlights "learn"
 * and "learned". Returns character ranges rather than HTML, so the client renders <mark>
 * elements safely without injecting markup.
 */
const STOPWORDS = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so that the their them then there these they this to was we what when where which who why will with you your about'.split(' ')
);

function stem(word) {
  return word.replace(/(ingly|edly|ings|ing|ies|ied|ers|er|ed|es|s)$/, '') || word;
}

export function queryTerms(q) {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(words.map((w) => (w.length > 4 ? stem(w) : w)))];
}

function termRegex(terms) {
  if (!terms.length) return null;
  const escaped = terms.map(escapeRegex).sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})[\\p{L}\\p{N}'-]*`, 'giu');
}

export function findRanges(text, terms) {
  const re = termRegex(terms);
  if (!re || !text) return [];
  const out = [];
  for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/**
 * Picks the window of `text` with the most term matches (or the start, for semantic-only
 * matches) and returns { text, highlights } with ranges relative to the snippet.
 */
export function snippetWithHighlights(text, terms, size = 260) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const ranges = findRanges(clean, terms);
  let start = 0;
  if (ranges.length) {
    let best = 0;
    let bestCount = -1;
    for (const [s] of ranges) {
      const from = Math.max(0, s - 60);
      const count = ranges.filter(([a, b]) => a >= from && b <= from + size).length;
      if (count > bestCount) {
        bestCount = count;
        best = from;
      }
    }
    start = best;
    // Don't cut a word in half at the start.
    if (start > 0) {
      const space = clean.indexOf(' ', start);
      if (space !== -1 && space - start < 20) start = space + 1;
    }
  }
  const end = Math.min(clean.length, start + size);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  const body = clean.slice(start, end);
  const highlights = ranges.filter(([a, b]) => a >= start && b <= end).map(([a, b]) => [a - start + prefix.length, b - start + prefix.length]);
  return { text: `${prefix}${body}${suffix}`, highlights };
}

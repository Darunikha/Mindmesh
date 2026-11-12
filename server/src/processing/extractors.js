import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

/**
 * Text extractors. Each returns { segments: [{ text, page?, heading? }], pageCount? }.
 * Throwing an ExtractionError marks the resource as failed with a user-facing message.
 */
export class ExtractionError extends Error {
  constructor(message, code = 'EXTRACTION_FAILED') {
    super(message);
    this.code = code;
  }
}

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
// pdfjs requires forward slashes and a trailing "/" even on Windows.
const STANDARD_FONTS = `${path.join(PDFJS_DIR, 'standard_fonts').replace(/\\/g, '/')}/`;
let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export async function extractPdf(data) {
  const pdfjs = await loadPdfjs();
  let pdf;
  const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      standardFontDataUrl: STANDARD_FONTS,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
  });
  try {
    pdf = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => {});
    if (err?.name === 'PasswordException') throw new ExtractionError('This PDF is password-protected.', 'PDF_ENCRYPTED');
    throw new ExtractionError('This PDF appears to be damaged or is not a valid PDF.', 'PDF_INVALID');
  }
  try {
    const segments = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str;
        text += item.hasEOL ? '\n' : item.str && !item.str.endsWith(' ') ? ' ' : '';
      }
      segments.push({ text, page: i });
      page.cleanup();
    }
    return { segments, pageCount: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

async function extractDocx(filePath) {
  try {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { segments: [{ text: value }] };
  } catch {
    throw new ExtractionError('This Word document could not be read. It may be damaged or in an older .doc format.', 'DOCX_INVALID');
  }
}

/** Splits markdown into heading-scoped segments so chunks know which section they came from. */
export function markdownSegments(source) {
  const segments = [];
  let heading = null;
  let buf = [];
  let inFence = false;
  const flush = () => {
    if (buf.join('').trim()) segments.push({ text: buf.join('\n'), heading });
    buf = [];
  };
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) {
      flush();
      heading = m[1].slice(0, 300);
      buf.push(m[1]);
    } else {
      buf.push(line);
    }
  }
  flush();
  return segments;
}

/** Extracts readable text from HTML, dropping scripts, chrome and navigation. */
export function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, template, svg, canvas, iframe, form, nav, footer, header, aside, [aria-hidden="true"], [hidden]').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('[role="main"]').first().length ? $('[role="main"]').first() : $('body');
  root.find('br').replaceWith('\n');
  root.find('p, div, section, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, dt, dd, figcaption').each((_, el) => {
    $(el).append('\n\n');
  });
  return root
    .text()
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rtfToText(rtf) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractFromFile(filePath, extractor) {
  if (extractor === 'pdf') return extractPdf(await fs.readFile(filePath));
  if (extractor === 'docx') return extractDocx(filePath);

  const raw = stripBom(await fs.readFile(filePath, 'utf8'));
  switch (extractor) {
    case 'markdown':
      return { segments: markdownSegments(raw) };
    case 'html':
      return { segments: [{ text: htmlToText(raw) }] };
    case 'rtf':
      return { segments: [{ text: rtfToText(raw) }] };
    case 'json': {
      try {
        return { segments: [{ text: JSON.stringify(JSON.parse(raw), null, 2) }] };
      } catch {
        throw new ExtractionError('This JSON file is not valid JSON.', 'JSON_INVALID');
      }
    }
    default:
      return { segments: [{ text: raw }] };
  }
}

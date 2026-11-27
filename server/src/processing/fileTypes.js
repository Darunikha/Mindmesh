/**
 * Supported upload formats. Each entry declares how the file is recognised (extension,
 * acceptable MIME types, signature check) and which extractor reads it.
 */
const isPdf = (head) => head.subarray(0, 1024).includes(Buffer.from('%PDF-'));
const isZip = (head) => head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
/** Text files must not contain NUL bytes and must decode as UTF-8 (allowing a cut multi-byte tail). */
const isText = (head) => {
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.max(0, head.length - 4)));
    return true;
  } catch {
    return false;
  }
};

const startsWith = (head, bytes) => head.subarray(0, bytes.length).equals(Buffer.from(bytes));
const isPng = (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (head) => startsWith(head, [0xff, 0xd8, 0xff]);
const isWebp = (head) => head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP';
const image = (mime, check) => ({ label: 'Image', extractor: 'image', mimes: [mime, 'application/octet-stream'], check });

const TEXT_MIMES = ['text/plain', 'application/octet-stream', ''];

export const FILE_TYPES = {
  '.pdf': { label: 'PDF', extractor: 'pdf', mimes: ['application/pdf', 'application/x-pdf', 'application/octet-stream'], check: isPdf },
  '.png': image('image/png', isPng),
  '.jpg': image('image/jpeg', isJpeg),
  '.jpeg': image('image/jpeg', isJpeg),
  '.webp': image('image/webp', isWebp),
  '.docx': {
    label: 'Word document',
    extractor: 'docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
    check: isZip,
  },
  '.txt': { label: 'Text', extractor: 'text', mimes: TEXT_MIMES, check: isText },
  '.md': { label: 'Markdown', extractor: 'markdown', mimes: [...TEXT_MIMES, 'text/markdown', 'text/x-markdown'], check: isText },
  '.markdown': { label: 'Markdown', extractor: 'markdown', mimes: [...TEXT_MIMES, 'text/markdown', 'text/x-markdown'], check: isText },
  '.csv': { label: 'CSV', extractor: 'text', mimes: [...TEXT_MIMES, 'text/csv', 'application/vnd.ms-excel'], check: isText },
  '.json': { label: 'JSON', extractor: 'json', mimes: [...TEXT_MIMES, 'application/json'], check: isText },
  '.html': { label: 'HTML', extractor: 'html', mimes: [...TEXT_MIMES, 'text/html'], check: isText },
  '.htm': { label: 'HTML', extractor: 'html', mimes: [...TEXT_MIMES, 'text/html'], check: isText },
  '.rtf': { label: 'Rich text', extractor: 'rtf', mimes: [...TEXT_MIMES, 'application/rtf', 'text/rtf'], check: (h) => h.subarray(0, 5).toString() === '{\\rtf' },
};

export const SUPPORTED_EXTENSIONS = Object.keys(FILE_TYPES);

/** Strips directories and control characters from a client-supplied filename (kept only as metadata). */
export function sanitizeFilename(name = '') {
  const base = String(name).split(/[\\/]/).pop() || 'untitled';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (cleaned || 'untitled').slice(0, 200);
}

export function titleFromFilename(name) {
  const withoutExt = name.replace(/\.[^.]+$/, '');
  return (withoutExt.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name).slice(0, 300);
}

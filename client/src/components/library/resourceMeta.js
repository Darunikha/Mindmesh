import { FileText, Globe, NotebookPen } from 'lucide-react';

/** Each theme names resource types in its own voice. */
export const TYPE_LABELS = {
  library: { note: 'Manuscript', document: 'Folio', link: 'Clipping' },
  studio: { note: 'Note', document: 'Doc', link: 'Link' },
  lab: { note: 'NOTE', document: 'DOC', link: 'URL' },
};

export const TYPE_PLURALS = {
  library: { note: 'Manuscripts', document: 'Folios', link: 'Clippings' },
  studio: { note: 'Notes', document: 'Docs', link: 'Links' },
  lab: { note: 'NOTES', document: 'DOCS', link: 'URLS' },
};

export const TYPE_ICONS = { note: NotebookPen, document: FileText, link: Globe };

/** Token-based tint per type, shared by every theme. */
export const TYPE_TINT = {
  note: { fg: 'text-accent', bg: 'bg-accent-soft', bar: 'bg-accent' },
  document: { fg: 'text-accent-2', bg: 'bg-accent-2-soft', bar: 'bg-accent-2' },
  link: { fg: 'text-accent-3', bg: 'bg-accent-3-soft', bar: 'bg-accent-3' },
};

export const TAG_TINT = {
  accent: 'text-accent',
  'accent-2': 'text-accent-2',
  'accent-3': 'text-accent-3',
  ink: 'text-ink-muted',
};

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function resourcePath(r) {
  return `/vault/${r.id}`;
}

/** A short, human summary of size: "3 pages", "1,204 words", "example.com". */
export function resourceDetail(r) {
  if (r.type === 'note') return `${(r.note?.wordCount || 0).toLocaleString()} words`;
  if (r.type === 'document') {
    const parts = [r.file?.label];
    if (r.file?.pageCount) parts.push(`${r.file.pageCount} ${r.file.pageCount === 1 ? 'page' : 'pages'}`);
    parts.push(formatBytes(r.file?.size));
    return parts.filter(Boolean).join(' · ');
  }
  return r.link?.domain || '';
}

export const isBusy = (r) => ['pending', 'processing'].includes(r?.processing?.status);

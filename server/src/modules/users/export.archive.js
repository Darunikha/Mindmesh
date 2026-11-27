/**
 * The "everything" download: a ZIP holding the JSON export plus the original uploaded files.
 * It is built while it is being sent, so large libraries are not held in the server's memory.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import yazl from 'yazl';
import Resource from '../../models/Resource.js';
import { absolutePath } from '../../processing/storage.js';
import { exportData } from './users.service.js';

/** Formats that are compressed already, so compressing them again only costs time. */
const STORED_AS_IS = new Set(['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp']);
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** A file name that is safe to unpack on any system: no folders, no reserved names, no duplicates. */
export function entryName(original, taken) {
  let name = String(original || '')
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (!name) name = 'file';
  if (RESERVED_ON_WINDOWS.test(name)) name = `_${name}`;
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length).slice(0, 150);
  let candidate = `${stem}${extension}`;
  // Windows and macOS treat "Notes.pdf" and "notes.pdf" as the same file.
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Returns a yazl ZipFile, already finalised; pipe its outputStream to the response. */
export async function buildArchive(userId) {
  const data = await exportData(userId);
  const documents = await Resource.find({ user: userId, type: 'document' }, { file: 1 }).sort({ createdAt: 1, _id: 1 }).lean();
  const entries = new Map(data.resources.map((r) => [r.id, r]));

  const zip = new yazl.ZipFile();
  // A file that can't be read part-way through must fail the download, not silently shorten it.
  zip.on('error', (err) => zip.outputStream.destroy(err));
  const taken = new Set();
  for (const doc of documents) {
    const entry = entries.get(String(doc._id));
    if (!entry || !doc.file?.storageKey) continue;
    const source = absolutePath(doc.file.storageKey);
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.isFile()) {
      entry.file = { ...entry.file, path: null, missing: true };
      continue;
    }
    const name = `files/${entryName(doc.file.originalName, taken)}`;
    entry.file = { ...entry.file, path: name };
    zip.addFile(source, name, { compress: !STORED_AS_IS.has(doc.file.extension) });
  }
  zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2)), 'mindmesh-export.json');
  zip.end();
  return zip;
}

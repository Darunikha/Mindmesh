import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import env from '../config/env.js';

/**
 * Local-disk object storage. Files are stored under UPLOAD_DIR/<userId>/<random><ext>.
 * Stored names are random, so user-supplied filenames never touch the filesystem.
 * Swap this module for S3/GCS later; callers only use storage keys.
 */
export const STORAGE_ROOT = path.resolve(env.UPLOAD_DIR);
export const TMP_DIR = path.join(STORAGE_ROOT, '.tmp');

export async function ensureStorage() {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

/** Resolves a storage key to an absolute path, refusing anything outside the storage root. */
export function absolutePath(key) {
  const p = path.resolve(STORAGE_ROOT, key);
  if (!p.startsWith(STORAGE_ROOT + path.sep)) throw new Error('Invalid storage key');
  return p;
}

export async function moveIntoStorage(tmpPath, userId, extension) {
  const key = `${userId}/${crypto.randomBytes(16).toString('hex')}${extension}`;
  const dest = absolutePath(key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(tmpPath, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.copyFile(tmpPath, dest);
    await fs.unlink(tmpPath);
  }
  return key;
}

export async function removeFile(keyOrPath, { isKey = true } = {}) {
  if (!keyOrPath) return;
  try {
    await fs.unlink(isKey ? absolutePath(keyOrPath) : keyOrPath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[mindmesh] Could not remove file:', err.message);
  }
}

export async function removeUserFiles(userId) {
  await fs.rm(absolutePath(String(userId)), { recursive: true, force: true });
}

export async function readHead(filePath, bytes = 8192) {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export function openStream(key) {
  return createReadStream(absolutePath(key));
}

export async function fileExists(key) {
  try {
    await fs.access(absolutePath(key));
    return true;
  } catch {
    return false;
  }
}

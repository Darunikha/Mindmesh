/**
 * Text recognition (OCR) for images and scanned PDF pages. It runs entirely on this server:
 * the engine and its English language data are installed packages, so no file leaves the
 * machine and no key is needed.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { ExtractionError } from './extractionError.js';

const require = createRequire(import.meta.url);
const LANG_DIR = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

/** Larger pictures are refused before they are decoded, so a tiny file can't exhaust memory. */
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_SIDE = 3000;
const SMALL_SIDE = 1000;
const MIN_CONFIDENCE = 35;
const PAGE_TIMEOUT_MS = 90_000;
const IDLE_MS = 15_000;

let worker = null;
let idleTimer = null;
let queue = Promise.resolve();

/** Frees the recognition engine. It is started again when next needed. */
export async function stopOcr() {
  clearTimeout(idleTimer);
  const current = worker;
  worker = null;
  await current?.terminate().catch(() => {});
}

async function run(image) {
  clearTimeout(idleTimer);
  let timer;
  try {
    worker ??= await createWorker('eng', 1, { langPath: LANG_DIR, gzip: true, cacheMethod: 'none', errorHandler: () => {} });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), PAGE_TIMEOUT_MS);
    });
    const { data } = await Promise.race([worker.recognize(image), timeout]);
    // Pictures without writing produce low-confidence noise, which is better treated as no text.
    return data.confidence >= MIN_CONFIDENCE ? data.text.trim() : '';
  } catch (err) {
    console.error(`[mindmesh] Text recognition failed: ${err?.message || err}`);
    await stopOcr();
    throw new ExtractionError('Text recognition failed on this file. You can try again.', 'OCR_FAILED');
  } finally {
    clearTimeout(timer);
    idleTimer = setTimeout(stopOcr, IDLE_MS);
    idleTimer.unref();
  }
}

/** True when a picture is (nearly) one flat shade, so there is nothing to read. */
function isBlank(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const shade = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (shade < min) min = shade;
    if (shade > max) max = shade;
    if (max - min > 40) return false;
  }
  return true;
}

/** Reads the writing on a canvas. One page is recognised at a time to bound memory use. */
export async function recognizeCanvas(canvas) {
  if (isBlank(canvas)) return '';
  // encode() compresses off the main thread, so the server keeps answering meanwhile.
  const png = await canvas.encode('png');
  const job = queue.then(() => run(png));
  queue = job.catch(() => {});
  return job;
}

/** Width and height read from a PNG, JPEG or WebP header, without decoding the picture. */
export function imageSize(data) {
  if (data.length >= 24 && data.toString('latin1', 1, 4) === 'PNG') return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data.length >= 30 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    const kind = data.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) return null;
      const marker = data[at + 1];
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      // Start-of-frame markers carry the size (C4, C8 and CC mean something else).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5) };
      }
      at += 2 + data.readUInt16BE(at + 2);
    }
  }
  return null;
}

const damaged = () => new ExtractionError('This image could not be read. It may be damaged.', 'IMAGE_INVALID');

/** Reads the writing in an uploaded PNG, JPEG or WebP. */
export async function recognizeImage(data) {
  const size = imageSize(data);
  if (!size?.width || !size.height) throw damaged();
  if (size.width * size.height > MAX_IMAGE_PIXELS) {
    throw new ExtractionError(`This image is too large to read (over ${MAX_IMAGE_PIXELS / 1e6} megapixels). Upload a smaller copy.`, 'IMAGE_TOO_LARGE');
  }
  let image;
  try {
    image = await loadImage(data);
  } catch {
    throw damaged();
  }
  const longest = Math.max(image.width, image.height);
  // Shrink huge photos; enlarge small screenshots, whose letters are otherwise too few pixels tall.
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest : longest < SMALL_SIDE ? 2 : 1;
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const ctx = canvas.getContext('2d');
  // Transparent areas become white paper rather than black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return recognizeCanvas(canvas);
}

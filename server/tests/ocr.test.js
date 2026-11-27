import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import env from '../src/config/env.js';
import { imageSize, stopOcr } from '../src/processing/ocr.js';
import { waitForIdle } from '../src/processing/queue.js';
import { makeUser, startTestApp } from './helpers.js';

let ctx;

before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await stopOcr();
  await ctx.stop();
});
beforeEach(() => ctx.reset());

/** A "photo" of printed text: pixels only, nothing selectable. */
function picture(lines, { format = 'image/png', width = 1240, height = 420, background = '#fff' } = {}) {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);
  }
  g.fillStyle = '#111';
  g.font = '44px Arial, Helvetica, DejaVu Sans, sans-serif';
  lines.forEach((line, i) => g.fillText(line, 60, 110 + i * 90));
  return canvas.toBuffer(format);
}

/** Builds a PDF whose pages are scans ({ scan }), typed text ({ text }) or empty ({}). */
async function pdfOf(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = pdf.addPage([595, 842]);
    if (p.scan) {
      const png = await pdf.embedPng(picture(p.scan));
      page.drawImage(png, { x: 0, y: 600, width: 595, height: 595 * (420 / 1240) });
    }
    if (p.text) page.drawText(p.text, { x: 50, y: 700, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

async function process(user, buffer, filename) {
  const res = await user.upload(buffer, filename);
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await waitForIdle();
  const { resource } = (await user.get(`/api/resources/${res.body.resource.id}`)).body;
  const chunks = (await user.get(`/api/resources/${resource.id}/chunks`)).body.chunks;
  return { resource, chunks, text: chunks.map((c) => c.text).join('\n') };
}

describe('images', () => {
  for (const [extension, format] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ]) {
    it(`reads the text in a .${extension} image and serves the picture back`, async () => {
      const u = await makeUser(ctx.app);
      const { resource, text } = await process(u, picture(['Photosynthesis converts light into energy.'], { format }), `notes.${extension}`);
      assert.equal(resource.processing.status, 'ready', resource.processing.error);
      assert.equal(resource.file.label, 'Image');
      assert.match(text, /Photosynthesis converts light into energy/);
      assert.match(resource.processing.note, /text recognition \(OCR\), so it may contain mistakes/);
      const file = await u.get(`/api/resources/${resource.id}/file`);
      assert.equal(file.headers['content-type'], format);
      assert.match(file.headers['content-security-policy'], /sandbox/);
    });
  }

  it('is searchable by what the picture says', async () => {
    const u = await makeUser(ctx.app);
    await process(u, picture(['The mitochondria produces adenosine triphosphate.']), 'whiteboard.png');
    const res = await u.get('/api/search?q=mitochondria');
    assert.equal(res.status, 200);
    assert.match(JSON.stringify(res.body), /whiteboard/);
  });

  it('reads dark writing on a transparent background', async () => {
    const u = await makeUser(ctx.app);
    const { text } = await process(u, picture(['Transparent background example'], { background: null }), 'clear.png');
    assert.match(text, /Transparent background example/);
  });

  it('turns a sideways phone photo upright using its orientation tag', async () => {
    const upright = createCanvas(1240, 420);
    const source = upright.getContext('2d');
    source.fillStyle = '#fff';
    source.fillRect(0, 0, 1240, 420);
    source.fillStyle = '#111';
    source.font = '44px Arial, Helvetica, DejaVu Sans, sans-serif';
    source.fillText('Stored sideways by the camera', 60, 200);
    const sideways = createCanvas(420, 1240);
    const g = sideways.getContext('2d');
    g.translate(0, 1240);
    g.rotate(-Math.PI / 2);
    g.drawImage(upright, 0, 0);
    // An EXIF block with one entry, Orientation = 6 ("rotate 90° to view").
    const exif = Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
    const jpeg = sideways.toBuffer('image/jpeg');
    const tagged = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif, jpeg.subarray(2)]);

    const u = await makeUser(ctx.app);
    const { text } = await process(u, tagged, 'phone.jpg');
    assert.match(text, /Stored sideways by the camera/);
  });

  it('says so when a picture has no writing', async () => {
    const u = await makeUser(ctx.app);
    const { resource } = await process(u, picture([]), 'blank.png');
    assert.equal(resource.processing.status, 'failed');
    assert.equal(resource.processing.code, 'NO_TEXT');
    assert.match(resource.processing.error, /No readable text was found in this image/);
    assert.equal((await u.get(`/api/resources/${resource.id}/file`)).status, 200);
  });

  it('rejects a renamed file, a damaged image and an oversized one', async () => {
    const u = await makeUser(ctx.app);
    const renamed = await u.upload(Buffer.from('plain text pretending'), 'fake.png');
    assert.equal(renamed.status, 415);

    const damaged = await process(u, Buffer.concat([picture(['x']).subarray(0, 24), Buffer.alloc(200, 7)]), 'damaged.png');
    assert.equal(damaged.resource.processing.code, 'IMAGE_INVALID');

    // A header claiming 30,000 × 30,000 pixels is refused before decoding.
    const bomb = Buffer.from(picture([]));
    bomb.writeUInt32BE(30000, 16);
    bomb.writeUInt32BE(30000, 20);
    const huge = await process(u, bomb, 'huge.png');
    assert.equal(huge.resource.processing.code, 'IMAGE_TOO_LARGE');
  });

  it('reads sizes from PNG, JPEG and WebP headers', () => {
    for (const format of ['image/png', 'image/jpeg', 'image/webp']) {
      assert.deepEqual(imageSize(picture(['x'], { format, width: 320, height: 200 })), { width: 320, height: 200 }, format);
    }
    assert.equal(imageSize(Buffer.from('not an image at all, just words')), null);
  });
});

describe('scanned PDFs', () => {
  it('reads a scan and keeps page numbers', async () => {
    const u = await makeUser(ctx.app);
    const pdf = await pdfOf([{ scan: ['Newton described three laws of motion.'] }, { scan: ['Darwin explained natural selection.'] }]);
    const { resource, chunks, text } = await process(u, pdf, 'scan.pdf');
    assert.equal(resource.processing.status, 'ready', resource.processing.error);
    assert.equal(resource.file.pageCount, 2);
    assert.match(text, /Newton described three laws of motion/);
    assert.match(text, /Darwin explained natural selection/);
    assert.equal(chunks[0].page, 1);
    assert.equal(chunks.at(-1).pageEnd, 2);
    assert.match(resource.processing.note, /Text on 2 pages was read with text recognition/);
  });

  it('only recognises the pages that lack selectable text', async () => {
    const u = await makeUser(ctx.app);
    const pdf = await pdfOf([{ text: 'This page has ordinary selectable text on it.' }, { scan: ['This page was photographed instead.'] }, {}]);
    const { resource, text } = await process(u, pdf, 'mixed.pdf');
    assert.match(text, /ordinary selectable text/);
    assert.match(text, /photographed instead/);
    assert.match(resource.processing.note, /Text on 1 page was read/);
  });

  it('adds no recognition note to an ordinary PDF', async () => {
    const u = await makeUser(ctx.app);
    const { resource } = await process(u, await pdfOf([{ text: 'A completely ordinary typed page of text.' }]), 'typed.pdf');
    assert.equal(resource.processing.status, 'ready');
    assert.equal(resource.processing.note, null);
  });

  it('stops at the page limit and says how many were left', async (t) => {
    const limit = env.OCR_MAX_PAGES;
    env.OCR_MAX_PAGES = 1;
    t.after(() => (env.OCR_MAX_PAGES = limit));
    const u = await makeUser(ctx.app);
    const pdf = await pdfOf([{ scan: ['First scanned page'] }, { scan: ['Second scanned page'] }, { scan: ['Third scanned page'] }]);
    const { resource, text } = await process(u, pdf, 'long.pdf');
    assert.match(text, /First scanned page/);
    assert.doesNotMatch(text, /Second scanned page/);
    assert.match(resource.processing.note, /2 more pages without selectable text were not read \(the limit is 1 per file\)/);
  });

  it('can be switched off', async (t) => {
    const limit = env.OCR_MAX_PAGES;
    env.OCR_MAX_PAGES = 0;
    t.after(() => (env.OCR_MAX_PAGES = limit));
    const u = await makeUser(ctx.app);
    const scan = await process(u, await pdfOf([{ scan: ['Unread words'] }]), 'off.pdf');
    assert.equal(scan.resource.processing.code, 'NO_TEXT');
    assert.match(scan.resource.processing.error, /switched off/);
    const photo = await process(u, picture(['Unread words']), 'off.png');
    assert.equal(photo.resource.processing.code, 'OCR_DISABLED');
  });
});

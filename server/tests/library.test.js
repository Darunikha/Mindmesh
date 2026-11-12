import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import env from '../src/config/env.js';
import Chunk from '../src/models/Chunk.js';
import Resource from '../src/models/Resource.js';
import { STORAGE_ROOT, absolutePath } from '../src/processing/storage.js';
import { waitForIdle } from '../src/processing/queue.js';
import { doc, heading, makeUser, startTestApp } from './helpers.js';

let ctx;
let site;
let siteUrl;

async function makePdf(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = pdf.addPage();
    if (text) page.drawText(text, { x: 50, y: 700, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

async function makeDocx() {
  const d = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Photosynthesis overview', heading: HeadingLevel.HEADING_1 }),
          new Paragraph('Chlorophyll absorbs light energy to convert carbon dioxide and water into glucose.'),
        ],
      },
    ],
  });
  return Packer.toBuffer(d);
}

before(async () => {
  ctx = await startTestApp();
  // A tiny local website for link-saving tests.
  site = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('User-agent: *\nDisallow: /private\n');
    }
    if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head><title>Neural Networks Explained</title>
        <meta name="description" content="A gentle introduction to neural networks.">
        <meta property="og:site_name" content="Learn Weekly">
        <link rel="icon" href="/icon.png"></head>
        <body><nav>Home | About</nav><article><h1>Neural Networks</h1>
        <p>Backpropagation adjusts weights by following the gradient of the loss.</p>
        <script>alert('x')</script></article><footer>© footer</footer></body></html>`);
    }
    if (req.url === '/moved') {
      res.writeHead(301, { location: '/article' });
      return res.end();
    }
    if (req.url === '/private/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><body><p>secret</p></body></html>');
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  siteUrl = `http://127.0.0.1:${site.address().port}`;
});

after(async () => {
  site.close();
  await waitForIdle();
  await ctx.stop();
  await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
});

beforeEach(async () => {
  await waitForIdle();
  await ctx.reset();
});

async function waitFor(u, id, statuses = ['ready', 'failed']) {
  await waitForIdle();
  const res = await u.get(`/api/resources/${id}?touch=false`);
  assert.ok(statuses.includes(res.body.resource.processing.status), `status was ${res.body.resource.processing.status}`);
  return res.body.resource;
}

describe('notes', () => {
  it('creates, autosaves with revision checks, indexes text and deletes', async () => {
    const u = await makeUser(ctx.app);
    const created = await u.post('/api/resources/notes', {
      title: 'Learning theory',
      content: doc(heading('Bias and variance'), 'Overfitting happens when a model memorises noise.'),
      tags: ['ML', 'theory', 'ml'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const note = created.body.resource;
    assert.equal(note.note.revision, 1);
    assert.equal(note.tags.length, 2, 'tags are de-duplicated case-insensitively');
    assert.equal(note.processing.status, 'ready');
    assert.ok(note.note.wordCount >= 9);

    const chunks = await u.get(`/api/resources/${note.id}/chunks`);
    assert.equal(chunks.body.chunks[0].heading, 'Bias and variance');

    // Autosave
    const saved = await u.patch(`/api/resources/${note.id}`, { content: doc('Regularisation reduces variance.'), baseRevision: 1 });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.resource.note.revision, 2);
    assert.match(saved.body.resource.excerpt, /Regularisation/);

    // Stale save from another tab is rejected, not silently overwritten.
    const stale = await u.patch(`/api/resources/${note.id}`, { content: doc('old tab'), baseRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'NOTE_CONFLICT');

    // Unsafe link marks are stripped
    const evil = await u.patch(`/api/resources/${note.id}`, {
      baseRevision: 2,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
    });
    assert.equal(evil.status, 200);
    assert.deepEqual(evil.body.resource.note.content.content[0].content[0].marks, []);

    const del = await u.del(`/api/resources/${note.id}`);
    assert.equal(del.status, 204);
    assert.equal(await Chunk.countDocuments({ resource: note.id }), 0);
    assert.equal((await u.get(`/api/resources/${note.id}`)).status, 404);
  });

  it('rejects malformed note content', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.post('/api/resources/notes', { content: { type: 'paragraph' } });
    assert.equal(res.status, 400);
  });
});

describe('documents', () => {
  it('uploads a PDF and extracts text per page in the background', async () => {
    const u = await makeUser(ctx.app);
    const pdf = await makePdf(['Gradient descent minimises the loss function.', 'Learning rate controls the step size.']);
    const res = await u.upload(pdf, 'ml-notes.pdf', { tags: JSON.stringify(['papers']) });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(res.body.resource.processing.status, 'pending');
    assert.equal(res.body.resource.title, 'ml-notes');

    const doneDoc = await waitFor(u, res.body.resource.id);
    assert.equal(doneDoc.processing.status, 'ready', doneDoc.processing.error);
    assert.equal(doneDoc.file.pageCount, 2);
    const chunks = (await u.get(`/api/resources/${doneDoc.id}/chunks`)).body.chunks;
    assert.equal(chunks[0].page, 1);
    assert.equal(chunks[0].pageEnd, 2);
    assert.match(chunks[0].text, /Gradient descent/);

    // File is stored privately and served back with safe headers
    const stored = await Resource.findById(doneDoc.id).lean();
    assert.ok(absolutePath(stored.file.storageKey).startsWith(STORAGE_ROOT));
    const file = await u.get(`/api/resources/${doneDoc.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers['content-type'], 'application/pdf');
    assert.match(file.headers['content-security-policy'], /sandbox/);

    // Deleting removes the stored file
    await u.del(`/api/resources/${doneDoc.id}`);
    await assert.rejects(fs.access(absolutePath(stored.file.storageKey)));
  });

  it('uploads DOCX and TXT files', async () => {
    const u = await makeUser(ctx.app);
    const d = await u.upload(await makeDocx(), 'biology.docx');
    assert.equal(d.status, 202, JSON.stringify(d.body));
    const t = await u.upload(Buffer.from('Plain text about the French Revolution of 1789.'), 'history.txt');
    assert.equal(t.status, 202);

    const docx = await waitFor(u, d.body.resource.id);
    assert.equal(docx.processing.status, 'ready', docx.processing.error);
    assert.match(docx.excerpt, /Chlorophyll/);
    const txt = await waitFor(u, t.body.resource.id);
    assert.equal(txt.processing.status, 'ready');
    // .txt files are never served as HTML
    const file = await u.get(`/api/resources/${txt.id}/file`);
    assert.match(file.headers['content-type'], /^text\/plain/);
  });

  it('marks a PDF without text as failed instead of pretending', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.upload(await makePdf(['']), 'scan.pdf');
    const r = await waitFor(u, res.body.resource.id);
    assert.equal(r.processing.status, 'failed');
    assert.equal(r.processing.code, 'NO_TEXT');
    assert.match(r.processing.error, /scanned/);
  });

  it('validates type, signature and size', async () => {
    const u = await makeUser(ctx.app);
    const exe = await u.upload(Buffer.from('MZ fake'), 'virus.exe');
    assert.equal(exe.status, 415);
    const fakePdf = await u.upload(Buffer.from('this is not a pdf'), 'fake.pdf');
    assert.equal(fakePdf.status, 415);
    assert.equal(fakePdf.body.error.code, 'CONTENT_MISMATCH');
    const binaryTxt = await u.upload(Buffer.from([0x00, 0x01, 0x02, 0x03]), 'data.txt');
    assert.equal(binaryTxt.status, 415);
    const big = await u.upload(Buffer.alloc(3 * 1024 * 1024, 'a'), 'big.txt');
    assert.equal(big.status, 413);
    const empty = await u.upload(Buffer.alloc(0), 'empty.txt');
    assert.equal(empty.status, 400);
    // Nothing leaked into storage
    const tmp = await fs.readdir(`${STORAGE_ROOT}/.tmp`);
    assert.equal(tmp.length, 0);
  });

  it('can reprocess a failed document', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.upload(await makePdf(['']), 'scan.pdf');
    await waitFor(u, res.body.resource.id);
    const again = await u.post(`/api/resources/${res.body.resource.id}/reprocess`);
    assert.equal(again.status, 202);
    assert.equal(again.body.resource.processing.status, 'pending');
    const r = await waitFor(u, res.body.resource.id);
    assert.equal(r.processing.status, 'failed');
  });
});

describe('links', () => {
  it('saves a link, follows redirects and extracts metadata and article text', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.post('/api/resources/links', { url: `${siteUrl}/moved` });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    const link = await waitFor(u, res.body.resource.id);
    assert.equal(link.processing.status, 'ready', link.processing.error);
    assert.equal(link.title, 'Neural Networks Explained');
    assert.equal(link.link.description, 'A gentle introduction to neural networks.');
    assert.equal(link.link.siteName, 'Learn Weekly');
    assert.equal(link.link.faviconUrl, `${siteUrl}/icon.png`);
    assert.equal(link.link.finalUrl, `${siteUrl}/article`);
    const text = (await u.get(`/api/resources/${link.id}/chunks`)).body.chunks.map((c) => c.text).join(' ');
    assert.match(text, /Backpropagation/);
    assert.doesNotMatch(text, /alert|footer|Home \| About/);

    const dup = await u.post('/api/resources/links', { url: `${siteUrl}/moved` });
    assert.equal(dup.status, 409);
  });

  it('keeps a custom title and reports unreachable or disallowed pages honestly', async () => {
    const u = await makeUser(ctx.app);
    const custom = await u.post('/api/resources/links', { url: `${siteUrl}/article`, title: 'My reading' });
    const c = await waitFor(u, custom.body.resource.id);
    assert.equal(c.title, 'My reading');

    const missing = await u.post('/api/resources/links', { url: `${siteUrl}/missing` });
    const m = await waitFor(u, missing.body.resource.id);
    assert.equal(m.processing.status, 'failed');
    assert.equal(m.processing.code, 'FETCH_NOT_FOUND');

    const robots = await u.post('/api/resources/links', { url: `${siteUrl}/private/page` });
    const r = await waitFor(u, robots.body.resource.id);
    assert.equal(r.processing.status, 'failed');
    assert.equal(r.processing.code, 'ROBOTS_DISALLOWED');
    assert.equal(r.processing.chunkCount, 0);
  });

  it('blocks private-network URLs (SSRF) when not explicitly allowed', async () => {
    const u = await makeUser(ctx.app);
    env.ALLOW_PRIVATE_LINK_FETCH = false;
    try {
      for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://localhost:4000/']) {
        const res = await u.post('/api/resources/links', { url });
        assert.equal(res.status, 400, `${url} should be rejected: ${JSON.stringify(res.body)}`);
      }
      const bad = await u.post('/api/resources/links', { url: 'ftp://example.com/file' });
      assert.equal(bad.status, 400);
    } finally {
      env.ALLOW_PRIVATE_LINK_FETCH = true;
    }
  });
});

describe('collections and tags', () => {
  it('creates nested collections, moves items, and never deletes items with a collection', async () => {
    const u = await makeUser(ctx.app);
    const research = (await u.post('/api/collections', { name: 'Research' })).body.collection;
    const ai = (await u.post('/api/collections', { name: 'AI', parentId: research.id })).body.collection;
    const reading = (await u.post('/api/collections', { name: 'Reading' })).body.collection;
    assert.equal((await u.post('/api/collections', { name: 'research' })).status, 409, 'sibling names are unique');

    const note = (await u.post('/api/resources/notes', { title: 'Transformers', collectionId: ai.id })).body.resource;
    assert.equal(note.collectionId, ai.id);
    const moved = await u.patch(`/api/resources/${note.id}`, { collectionId: reading.id });
    assert.equal(moved.body.resource.collectionId, reading.id);

    // Cycles are rejected
    const cycle = await u.patch(`/api/collections/${research.id}`, { parentId: ai.id });
    assert.equal(cycle.status, 400);
    const renamed = await u.patch(`/api/collections/${ai.id}`, { name: 'Artificial Intelligence' });
    assert.equal(renamed.body.collection.name, 'Artificial Intelligence');

    const listed = await u.get('/api/collections');
    assert.equal(listed.body.collections.find((c) => c.id === reading.id).count, 1);

    // Deleting a collection keeps its items (they become unfiled) and lifts sub-collections
    await u.patch(`/api/resources/${note.id}`, { collectionId: research.id });
    const del = await u.del(`/api/collections/${research.id}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.movedResources, 1);
    assert.equal(del.body.movedCollections, 1);
    const after = (await u.get(`/api/resources/${note.id}`)).body.resource;
    assert.equal(after.collectionId, null);
    const remaining = (await u.get('/api/collections')).body.collections;
    assert.equal(remaining.find((c) => c.id === ai.id).parentId, null);

    // Or move them into another collection on delete
    await u.patch(`/api/resources/${note.id}`, { collectionId: ai.id });
    const del2 = await u.del(`/api/collections/${ai.id}?moveTo=${reading.id}`);
    assert.equal(del2.body.movedTo, reading.id);
    assert.equal((await u.get(`/api/resources/${note.id}`)).body.resource.collectionId, reading.id);
  });

  it('creates, renames, filters by and deletes tags', async () => {
    const u = await makeUser(ctx.app);
    const a = (await u.post('/api/resources/notes', { title: 'A', tags: ['physics', 'quantum'] })).body.resource;
    await u.post('/api/resources/notes', { title: 'B', tags: ['physics'] });
    await u.post('/api/resources/notes', { title: 'C' });

    const tags = (await u.get('/api/tags')).body.tags;
    const physics = tags.find((t) => t.name === 'physics');
    const quantum = tags.find((t) => t.name === 'quantum');
    assert.equal(physics.count, 2);

    assert.equal((await u.get(`/api/resources?tags=${physics.id}`)).body.total, 2);
    assert.equal((await u.get(`/api/resources?tags=${physics.id},${quantum.id}`)).body.total, 1);

    assert.equal((await u.post('/api/tags', { name: 'Physics' })).status, 409);
    const renamed = await u.patch(`/api/tags/${physics.id}`, { name: 'Physics & Maths' });
    assert.equal(renamed.body.tag.name, 'Physics & Maths');
    assert.equal((await u.get(`/api/resources/${a.id}`)).body.resource.tags.some((t) => t.name === 'Physics & Maths'), true);

    const removed = await u.del(`/api/tags/${quantum.id}`);
    assert.equal(removed.body.detachedFrom, 1);
    assert.equal((await u.get('/api/resources')).body.total, 3, 'deleting a tag never deletes resources');
  });
});

describe('search, sorting and listing', () => {
  it('finds items by title, tags-filters, content inside documents and sorts', async () => {
    const u = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'Zebra migration', content: doc('Herds cross the Mara river each year.') });
    await u.post('/api/resources/notes', { title: 'Apple pie recipe', content: doc('Cinnamon and butter.'), pinned: true });
    const pdf = await u.upload(await makePdf(['The mitochondria is the powerhouse of the cell.']), 'cells.pdf');
    await waitFor(u, pdf.body.resource.id);

    const byContent = await u.get('/api/resources?q=mitochondria');
    assert.equal(byContent.body.total, 1);
    assert.equal(byContent.body.items[0].type, 'document');
    assert.match(byContent.body.items[0].match.snippet, /mitochondria/i);
    assert.equal(byContent.body.items[0].match.page, 1);

    assert.equal((await u.get('/api/resources?q=zeb')).body.items[0].title, 'Zebra migration', 'partial title match');
    assert.equal((await u.get('/api/resources?q=river')).body.total, 1, 'note body is searchable');

    const sorted = await u.get('/api/resources?sort=title');
    assert.deepEqual(sorted.body.items.map((i) => i.title), ['Apple pie recipe', 'cells', 'Zebra migration']);
    assert.equal((await u.get('/api/resources?type=document')).body.total, 1);
    assert.equal((await u.get('/api/resources?pinned=true')).body.total, 1);

    const paged = await u.get('/api/resources?limit=2&page=1');
    assert.equal(paged.body.items.length, 2);
    assert.equal(paged.body.hasMore, true);

    const overview = await u.get('/api/resources/overview');
    assert.deepEqual(overview.body.counts, { note: 2, document: 1, link: 0, total: 3, processing: 0 });
    assert.equal(overview.body.pinned.length, 1);
    assert.equal(overview.body.recentlyAdded.length, 3);
  });
});

describe('isolation', () => {
  it("never exposes or modifies another user's library", async () => {
    const alice = await makeUser(ctx.app, 'Alice');
    const bob = await makeUser(ctx.app, 'Bob');
    const secret = (await alice.post('/api/resources/notes', { title: 'Alice secret', content: doc('classified plans') })).body.resource;
    const pdf = await alice.upload(await makePdf(['alice private pdf']), 'alice.pdf');
    await waitFor(alice, pdf.body.resource.id);
    const col = (await alice.post('/api/collections', { name: 'Private' })).body.collection;
    const tag = (await alice.get('/api/tags')).body.tags[0];

    assert.equal((await bob.get(`/api/resources/${secret.id}`)).status, 404);
    assert.equal((await bob.get(`/api/resources/${secret.id}/chunks`)).status, 404);
    assert.equal((await bob.get(`/api/resources/${pdf.body.resource.id}/file`)).status, 404);
    assert.equal((await bob.patch(`/api/resources/${secret.id}`, { title: 'pwned' })).status, 404);
    assert.equal((await bob.del(`/api/resources/${secret.id}`)).status, 404);
    assert.equal((await bob.get('/api/resources?q=classified')).body.total, 0);
    assert.equal((await bob.get('/api/resources?q=alice')).body.total, 0);
    assert.equal((await bob.get('/api/resources')).body.total, 0);
    assert.equal((await bob.post('/api/resources/notes', { title: 'x', collectionId: col.id })).status, 400);
    assert.equal((await bob.patch(`/api/collections/${col.id}`, { name: 'mine' })).status, 404);
    assert.equal((await bob.del(`/api/collections/${col.id}`)).status, 404);
    if (tag) assert.equal((await bob.del(`/api/tags/${tag.id}`)).status, 404);
    const bulk = await bob.post('/api/resources/bulk', { ids: [secret.id], action: 'delete' });
    assert.equal(bulk.body.affected, 0);

    assert.equal((await alice.get(`/api/resources/${secret.id}`)).body.resource.title, 'Alice secret');
  });

  it('deleting an account removes its resources, chunks and files', async () => {
    const u = await makeUser(ctx.app);
    const pdf = await u.upload(await makePdf(['to be deleted']), 'gone.pdf');
    await waitFor(u, pdf.body.resource.id);
    const stored = await Resource.findById(pdf.body.resource.id).lean();
    const res = await u.del('/api/users/me', { password: 'password123', confirm: 'DELETE' });
    assert.equal(res.status, 204);
    assert.equal(await Resource.countDocuments({ user: u.user.id }), 0);
    assert.equal(await Chunk.countDocuments({ user: u.user.id }), 0);
    await assert.rejects(fs.access(absolutePath(stored.file.storageKey)));
  });
});

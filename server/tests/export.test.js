import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import request from 'supertest';
import yauzl from 'yauzl';
import Resource from '../src/models/Resource.js';
import { entryName } from '../src/modules/users/export.archive.js';
import { absolutePath } from '../src/processing/storage.js';
import { waitForIdle } from '../src/processing/queue.js';
import { doc, makeUser, startTestApp } from './helpers.js';

let ctx;

before(async () => {
  ctx = await startTestApp();
});
after(() => ctx.stop());
beforeEach(() => ctx.reset());

/** Unpacks a ZIP held in memory into a map of name → contents. */
function unzip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const parts = [];
          stream.on('data', (d) => parts.push(d));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(parts));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function download(user) {
  const res = await user
    .get('/api/users/me/export?files=true')
    .buffer(true)
    .parse((response, done) => {
      const parts = [];
      response.on('data', (d) => parts.push(d));
      response.on('end', () => done(null, Buffer.concat(parts)));
    });
  assert.equal(res.status, 200);
  const files = await unzip(res.body);
  return { res, files, data: JSON.parse(files.get('mindmesh-export.json').toString('utf8')) };
}

async function upload(user, contents, name) {
  const res = await user.upload(contents, name);
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await waitForIdle();
  return res.body.resource;
}

describe('data export with files', () => {
  it('holds the data and every uploaded file, byte for byte', async () => {
    const u = await makeUser(ctx.app);
    const text = Buffer.from('The French Revolution began in 1789.\n'.repeat(500));
    const accented = Buffer.from('# Résumé\n\nCafé notes.');
    await u.post('/api/resources/notes', { title: 'A note', content: doc('Note text.') });
    await upload(u, text, 'history.txt');
    await upload(u, accented, 'résumé.md');

    const { res, files, data } = await download(u);
    assert.equal(res.headers['content-type'], 'application/zip');
    assert.match(res.headers['content-disposition'], /attachment; filename="mindmesh-export.zip"/);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual([...files.keys()].sort(), ['files/history.txt', 'files/résumé.md', 'mindmesh-export.json']);
    assert.ok(files.get('files/history.txt').equals(text));
    assert.ok(files.get('files/résumé.md').equals(accented));

    assert.equal(data.format, 'mindmesh-export-v1');
    assert.equal(data.resources.length, 3);
    assert.equal(data.resources.find((r) => r.title === 'history').file.path, 'files/history.txt');
    const everything = [...files.values()].map(String).join('');
    assert.ok(!everything.includes('passwordHash') && !everything.includes('storageKey'));
  });

  it('keeps files that share a name apart', async () => {
    const u = await makeUser(ctx.app);
    await upload(u, Buffer.from('first version'), 'notes.txt');
    await upload(u, Buffer.from('second version'), 'Notes.txt');
    const { files, data } = await download(u);
    assert.equal(files.get('files/notes.txt').toString(), 'first version');
    assert.equal(files.get('files/Notes (2).txt').toString(), 'second version');
    assert.deepEqual(data.resources.map((r) => r.file.path).sort(), ['files/Notes (2).txt', 'files/notes.txt']);
  });

  it('only ever includes your own files', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    await upload(u, Buffer.from('mine'), 'mine.txt');
    await upload(other, Buffer.from('someone else’s secret'), 'theirs.txt');
    const { files, data } = await download(u);
    assert.deepEqual([...files.keys()].sort(), ['files/mine.txt', 'mindmesh-export.json']);
    assert.ok(!JSON.stringify(data).includes('secret'));
  });

  it('marks a file that is no longer on disk and still sends the rest', async () => {
    const u = await makeUser(ctx.app);
    const gone = await upload(u, Buffer.from('will vanish'), 'gone.txt');
    await upload(u, Buffer.from('still here'), 'kept.txt');
    const stored = await Resource.findById(gone.id).lean();
    await fs.unlink(absolutePath(stored.file.storageKey));
    const { files, data } = await download(u);
    assert.deepEqual([...files.keys()].sort(), ['files/kept.txt', 'mindmesh-export.json']);
    const entry = data.resources.find((r) => r.id === gone.id);
    assert.equal(entry.file.missing, true);
    assert.equal(entry.file.path, null);
    assert.equal(entry.extractedText, 'will vanish');
  });

  it('works with nothing uploaded', async () => {
    const u = await makeUser(ctx.app);
    const { files, data } = await download(u);
    assert.deepEqual([...files.keys()], ['mindmesh-export.json']);
    assert.deepEqual(data.resources, []);
  });

  it('requires signing in, rejects unknown options, and leaves the plain JSON download as it was', async () => {
    assert.equal((await request(ctx.app).get('/api/users/me/export?files=true')).status, 401);
    const u = await makeUser(ctx.app);
    await upload(u, Buffer.from('hello'), 'a.txt');
    assert.equal((await u.get('/api/users/me/export?files=maybe')).status, 400);
    const plain = await u.get('/api/users/me/export');
    assert.match(plain.headers['content-type'], /application\/json/);
    assert.deepEqual(plain.body.resources[0].file, { name: 'a.txt', size: 5 });
  });

  it('makes names safe to unpack', () => {
    const taken = new Set();
    assert.equal(entryName('../../etc/passwd', taken), 'passwd');
    assert.equal(entryName('..\\..\\evil.exe', taken), 'evil.exe');
    assert.equal(entryName('a<b>:c?.txt', taken), 'abc.txt');
    assert.equal(entryName('CON.txt', taken), '_CON.txt');
    assert.equal(entryName('..', taken), 'file');
    assert.equal(entryName('', taken), 'file (2)');
    assert.equal(entryName(' spaced.pdf. ', taken), 'spaced.pdf');
  });
});

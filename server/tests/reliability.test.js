import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import Chunk from '../src/models/Chunk.js';
import Message from '../src/models/Message.js';
import Resource from '../src/models/Resource.js';
import { waitForIdle } from '../src/processing/queue.js';
import { sseParser, useFakeProviders, parseSse } from './fakeProviders.js';
import { doc, makeUser, startTestApp } from './helpers.js';

let ctx;
before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await waitForIdle();
  await ctx.stop();
});
beforeEach(async () => {
  await waitForIdle();
  await ctx.reset();
  useFakeProviders();
});

const note = async (u, title, text) => (await u.post('/api/resources/notes', { title, content: doc(text) })).body.resource;

describe('no stale content after deletes and edits', () => {
  it('deleting an item removes it from search, the graph, layouts and vector search, and flags old citations', async () => {
    const u = await makeUser(ctx.app);
    const keep = await note(u, 'Keeper', 'Neural networks learn from training data examples.');
    const gone = await note(u, 'Doomed', 'Neural networks adjust weights using training examples.');
    await waitForIdle();
    await u.post('/api/graph/connections', { sourceId: keep.id, targetId: gone.id });
    await request(ctx.app).put('/api/graph/layout').set(u.auth).send({ positions: { [`r:${gone.id}`]: { x: 1, y: 2 } } });

    // An answer that cites the item that will be deleted.
    const conv = (await u.post('/api/conversations', {})).body.conversation;
    const ev = parseSse(
      (await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(u.auth).send({ content: 'How do neural networks learn from training examples?', mode: 'knowledge', clientRequestId: crypto.randomUUID() }).buffer(true).parse(sseParser)).body
    );
    const answer = ev.find((e) => e.event === 'done').data.message;
    assert.ok(answer.citations.some((c) => c.resourceId === gone.id));

    // Warm the in-memory vector cache, then delete.
    assert.equal((await u.get('/api/search?q=how%20computers%20learn%20from%20examples&mode=semantic')).body.total, 2);
    assert.equal((await u.del(`/api/resources/${gone.id}`)).status, 204);

    assert.equal(await Chunk.countDocuments({ resource: gone.id }), 0);
    const sem = (await u.get('/api/search?q=how%20computers%20learn%20from%20examples&mode=semantic')).body;
    assert.deepEqual(sem.items.map((i) => i.resource.id), [keep.id], 'vector cache was invalidated');
    assert.equal((await u.get('/api/search?q=adjust%20weights&mode=keyword')).body.total, 0);

    const graph = (await u.get('/api/graph')).body;
    assert.ok(!graph.nodes.some((n) => n.id === `r:${gone.id}`));
    assert.equal(graph.edges.filter((e) => e.kind === 'manual').length, 0);

    const stored = await Message.findById(answer.id).lean();
    const cite = stored.citations.find((c) => String(c.resourceId) === gone.id);
    assert.equal(cite.resourceDeleted, true, 'citation is kept but marked as deleted');
    const fresh = (await u.get(`/api/conversations/${conv.id}`)).body.messages.at(-1);
    assert.equal(fresh.citations.find((c) => c.resourceId === gone.id).resourceDeleted, true);

    // Retrieval can no longer return it.
    const ev2 = parseSse(
      (await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(u.auth).send({ content: 'neural networks training examples weights', mode: 'knowledge', clientRequestId: crypto.randomUUID() }).buffer(true).parse(sseParser)).body
    );
    assert.ok(ev2.find((e) => e.event === 'sources').data.passages.every((p) => p.resourceId !== gone.id));
  });

  it('editing a note replaces its searchable text and its vectors', async () => {
    const u = await makeUser(ctx.app);
    const n = await note(u, 'Draft', 'Photosynthesis happens in chloroplasts.');
    await waitForIdle();
    assert.equal((await u.get('/api/search?q=chloroplasts&mode=keyword')).body.total, 1);
    const r = (await u.get(`/api/resources/${n.id}?touch=false`)).body.resource;
    await u.patch(`/api/resources/${n.id}`, { baseRevision: r.note.revision, content: doc('Neural networks learn from training data.') });
    await waitForIdle();
    assert.equal((await u.get('/api/search?q=chloroplasts&mode=keyword')).body.total, 0, 'old text is no longer searchable');
    assert.equal((await u.get('/api/search?q=how%20computers%20learn%20from%20examples&mode=semantic')).body.total, 1, 'new text is found by meaning');
  });

  it('the vault search uses the unified ranking, including meaning', async () => {
    const u = await makeUser(ctx.app);
    await note(u, 'Neural notes', 'Neural networks adjust weights using training data.');
    await waitForIdle();
    const res = await u.get('/api/resources?q=how%20computers%20learn%20from%20examples');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].title, 'Neural notes');
  });

  it('records a settled search without re-running it', async () => {
    const u = await makeUser(ctx.app);
    assert.equal((await u.post('/api/search/recent', { query: 'quantum tunnelling', resultCount: 3 })).status, 204);
    const recent = (await u.get('/api/search/recent')).body.searches;
    assert.equal(recent[0].query, 'quantum tunnelling');
    assert.equal(recent[0].resultCount, 3);
    assert.equal((await u.post('/api/search/recent', { query: 'x' })).status, 400);
  });
});

describe('authentication hardening', () => {
  it('rejects unsigned, wrongly signed and expired tokens', async () => {
    const u = await makeUser(ctx.app);
    const payload = jwt.decode(u.auth.Authorization.slice(7));
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
    assert.equal((await request(ctx.app).get('/api/users/me').set('Authorization', `Bearer ${none}`)).status, 401);
    const forged = jwt.sign({ sid: payload.sid }, 'not-the-server-secret-not-the-server-secret', { subject: payload.sub, issuer: 'mindmesh', audience: 'mindmesh-app' });
    assert.equal((await request(ctx.app).get('/api/users/me').set('Authorization', `Bearer ${forged}`)).status, 401);
    const expired = jwt.sign({ sid: payload.sid, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_ACCESS_SECRET, { subject: payload.sub, issuer: 'mindmesh', audience: 'mindmesh-app' });
    const res = await request(ctx.app).get('/api/users/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('stores uploads under random names whatever the client calls them', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.upload(Buffer.from('plain text'), '..\\..\\evil<script>.txt');
    assert.equal(res.status, 202, JSON.stringify(res.body));
    const stored = await Resource.findById(res.body.resource.id).lean();
    assert.doesNotMatch(stored.file.storageKey, /\.\.|evil|script/);
    assert.equal(stored.file.originalName, 'evilscript.txt');
  });

  it('never returns stack traces or internals in error responses', async () => {
    const u = await makeUser(ctx.app);
    const res = await u.get('/api/resources/not-an-id');
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.ok(!JSON.stringify(res.body).includes('at '), 'no stack frames');
  });
});

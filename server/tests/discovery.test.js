import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import Resource from '../src/models/Resource.js';
import Activity from '../src/models/Activity.js';
import User from '../src/models/User.js';
import Connection from '../src/models/Connection.js';
import { waitForIdle } from '../src/processing/queue.js';
import { sseParser, useFakeProviders } from './fakeProviders.js';
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

const note = async (u, title, text, extra = {}) => (await u.post('/api/resources/notes', { title, content: doc(text), ...extra })).body.resource;

describe('smart search', () => {
  it('finds content by meaning even when none of the query words appear', async () => {
    const u = await makeUser(ctx.app);
    const nn = await note(u, 'Neural networks', 'Neural networks adjust weights using training data.');
    await note(u, 'Sourdough', 'Feed the starter with flour before you bake bread.');
    await waitForIdle();

    const smart = await u.get('/api/search?q=how%20computers%20learn%20from%20examples');
    assert.equal(smart.status, 200, JSON.stringify(smart.body));
    assert.equal(smart.body.items[0].resource.id, nn.id);
    assert.deepEqual(smart.body.items[0].matchedBy, ['semantic']);
    assert.equal(smart.body.items[0].passages[0].matchedBy, 'semantic');
    assert.ok(smart.body.items.every((i) => i.resource.title !== 'Sourdough'), 'unrelated content is not returned');
    assert.equal(smart.body.semantic.used, true);

    const keyword = await u.get('/api/search?q=how%20computers%20learn%20from%20examples&mode=keyword');
    assert.equal(keyword.body.total, 0, 'the exact words are absent, so keyword search finds nothing');
  });

  it('matches titles and full text inside documents, highlights terms, and returns each item once', async () => {
    const u = await makeUser(ctx.app);
    const long = Array.from({ length: 40 }, (_, i) => `Photosynthesis step ${i} converts light energy in chloroplasts.`).join(' ');
    const n = await note(u, 'Plant biology', long);
    await note(u, 'Photosynthesis basics', 'Short intro.');
    await waitForIdle();

    const res = await u.get('/api/search?q=photosynthesis&mode=keyword');
    const ids = res.body.items.map((i) => i.resource.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate results');
    assert.equal(res.body.total, 2);
    const titleHit = res.body.items.find((i) => i.resource.title === 'Photosynthesis basics');
    assert.deepEqual(titleHit.titleHighlights, [[0, 14]]);
    const bodyHit = res.body.items.find((i) => i.resource.id === n.id);
    assert.ok(bodyHit.passages.length >= 1 && bodyHit.passages.length <= 2);
    const p = bodyHit.passages[0];
    assert.ok(p.highlights.length > 0);
    for (const [a, b] of p.highlights) assert.equal(p.text.slice(a, b).toLowerCase(), 'photosynthesis');
  });

  it('filters by type, tags, collection and date, and sorts newest/oldest', async () => {
    const u = await makeUser(ctx.app);
    const col = (await u.post('/api/collections', { name: 'Course' })).body.collection;
    const a = await note(u, 'Orbit notes A', 'orbital mechanics', { tags: ['space'], collectionId: col.id });
    const b = await note(u, 'Orbit notes B', 'orbital mechanics', { tags: ['space', 'exam'] });
    const c = await note(u, 'Orbit notes C', 'orbital mechanics');
    // createdAt is immutable in Mongoose, so backdate through the raw driver.
    const setCreated = (id, d) => Resource.collection.updateOne({ _id: new Resource.base.Types.ObjectId(id) }, { $set: { createdAt: new Date(d) } });
    await setCreated(a.id, '2024-01-10');
    await setCreated(b.id, '2025-06-01');
    await setCreated(c.id, '2026-03-01');
    const tags = (await u.get('/api/tags')).body.tags;
    const space = tags.find((t) => t.name === 'space').id;
    const exam = tags.find((t) => t.name === 'exam').id;

    const titles = async (qs) => (await u.get(`/api/search?q=orbital&${qs}`)).body.items.map((i) => i.resource.title);
    assert.deepEqual(await titles(`tags=${space}&sort=oldest`), ['Orbit notes A', 'Orbit notes B']);
    assert.deepEqual(await titles(`tags=${space},${exam}`), ['Orbit notes B']);
    assert.deepEqual(await titles(`collection=${col.id}`), ['Orbit notes A']);
    assert.deepEqual(await titles('from=2025-01-01&to=2025-12-31'), ['Orbit notes B']);
    assert.deepEqual(await titles('sort=newest'), ['Orbit notes C', 'Orbit notes B', 'Orbit notes A']);
    assert.deepEqual(await titles('type=document'), []);
    assert.equal((await u.get('/api/search?q=orbital&from=2026-01-01&to=2025-01-01')).status, 400);
  });

  it('records recent searches, offers suggestions, and stays within the user’s data', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    await note(u, 'Quantum computing primer', 'qubits and superposition', { tags: ['quantum'] });
    await note(other, 'Quantum secrets of Bob', 'qubits and superposition');
    await waitForIdle();

    await u.get('/api/search?q=qubits&record=true');
    await u.get('/api/search?q=Qubits&record=true');
    await u.get('/api/search?q=superposition&record=true');
    const recent = (await u.get('/api/search/recent')).body.searches;
    assert.deepEqual(recent.map((s) => s.query), ['superposition', 'Qubits']);
    assert.equal(recent[1].count, 2);

    const res = await u.get('/api/search?q=qubits');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].resource.title, 'Quantum computing primer');

    const sug = (await u.get('/api/search/suggest?q=qua')).body;
    assert.deepEqual(sug.resources.map((r) => r.title), ['Quantum computing primer']);
    assert.deepEqual(sug.tags.map((t) => t.name), ['quantum']);

    await u.del(`/api/search/recent/${recent[0].id}`);
    assert.equal((await u.get('/api/search/recent')).body.searches.length, 1);
    await u.del('/api/search/recent');
    assert.equal((await u.get('/api/search/recent')).body.searches.length, 0);
    assert.equal((await other.get('/api/search/recent')).body.searches.length, 0);
  });

  it('falls back to keyword search with an explanation when embeddings are off', async () => {
    useFakeProviders({ chat: true, embeddings: false });
    const u = await makeUser(ctx.app);
    await note(u, 'Tides', 'The moon pulls the oceans.');
    await waitForIdle();
    const res = await u.get('/api/search?q=moon');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.semantic.used, false);
    assert.match(res.body.semantic.reason, /embedding provider/);
  });
});

describe('knowledge graph', () => {
  it('returns resources, topics and collections with edges, honouring filters and saved layout', async () => {
    const u = await makeUser(ctx.app);
    const parent = (await u.post('/api/collections', { name: 'Science' })).body.collection;
    const child = (await u.post('/api/collections', { name: 'Physics', parentId: parent.id })).body.collection;
    const a = await note(u, 'Gravity', 'Mass attracts mass.', { tags: ['forces'], collectionId: child.id });
    const b = await note(u, 'Magnetism', 'Fields and poles.', { tags: ['forces'] });
    await u.post('/api/resources/links', { url: 'https://example.invalid/page' });
    await waitForIdle();
    await u.post('/api/graph/connections', { sourceId: a.id, targetId: b.id, label: 'both forces' });

    const g = (await u.get('/api/graph')).body;
    const kinds = (k) => g.nodes.filter((n) => n.kind === k);
    assert.equal(kinds('resource').length, 3);
    assert.deepEqual(kinds('topic').map((n) => n.label), ['forces']);
    assert.deepEqual(kinds('collection').map((n) => n.label).sort(), ['Physics', 'Science']);
    const edgeKinds = g.edges.map((e) => e.kind).sort();
    assert.deepEqual(edgeKinds, ['collection', 'manual', 'nested', 'topic', 'topic']);
    assert.equal(g.edges.find((e) => e.kind === 'manual').label, 'both forces');

    const notesOnly = (await u.get('/api/graph?types=note&showTopics=false&showCollections=false')).body;
    assert.equal(notesOnly.nodes.length, 2);
    assert.deepEqual(notesOnly.edges.map((e) => e.kind), ['manual']);
    assert.equal((await u.get(`/api/graph?collection=${child.id}`)).body.nodes.filter((n) => n.kind === 'resource').length, 1);

    assert.equal((await request(ctx.app).put('/api/graph/layout').set(u.auth).send({ positions: { [`r:${a.id}`]: { x: 120.4, y: -40 } } })).status, 204);
    const withLayout = (await u.get('/api/graph')).body;
    assert.deepEqual(withLayout.nodes.find((n) => n.id === `r:${a.id}`).position, { x: 120, y: -40 });
    await u.del('/api/graph/layout');
    assert.equal((await u.get('/api/graph')).body.nodes.find((n) => n.id === `r:${a.id}`).position, undefined);
  });

  it('manages manual connections safely', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    const a = await note(u, 'A', 'alpha');
    const b = await note(u, 'B', 'beta');
    const x = await note(other, 'X', 'secret');

    assert.equal((await u.post('/api/graph/connections', { sourceId: a.id, targetId: a.id })).status, 400);
    assert.equal((await u.post('/api/graph/connections', { sourceId: a.id, targetId: x.id })).status, 400, 'cannot connect to another user’s item');
    const c = (await u.post('/api/graph/connections', { sourceId: b.id, targetId: a.id })).body.connection;
    assert.equal((await u.post('/api/graph/connections', { sourceId: a.id, targetId: b.id })).status, 409, 'pairs are unordered and unique');
    assert.equal((await other.del(`/api/graph/connections/${c.id}`)).status, 404);
    assert.equal((await u.patch(`/api/graph/connections/${c.id}`, { label: 'pair' })).body.connection.label, 'pair');

    await u.del(`/api/resources/${a.id}`);
    assert.equal(await Connection.countDocuments({ _id: c.id }), 0, 'deleting an item removes its connections');
  });

  it('suggests a few meaningful connections for review, and never repeats dismissed ones', async () => {
    const u = await makeUser(ctx.app);
    const ml1 = await note(u, 'Neural nets', 'Neural networks learn weights from training data examples.');
    const ml2 = await note(u, 'Learning from data', 'Training on labelled examples teaches networks.');
    const bake = await note(u, 'Bread', 'Sourdough starter, flour and a hot oven make bread.');
    await note(u, 'Baking UNRELATED', 'Bake bread with flour in the oven using a recipe.');
    await waitForIdle();

    const gen = (await u.post('/api/graph/suggestions/generate', {})).body;
    assert.equal(gen.method, 'embeddings+ai-review');
    const pairs = gen.created.map((s) => [s.sourceTitle, s.targetTitle].sort().join(' + '));
    assert.ok(pairs.includes('Learning from data + Neural nets'), JSON.stringify(pairs));
    assert.ok(!pairs.some((p) => p.includes('UNRELATED')), 'pairs the reviewer rejects are dropped');
    assert.ok(!pairs.some((p) => p.includes('Neural') && p.includes('Bread')), 'unrelated topics are not linked');
    assert.ok(gen.created.length <= 8);
    assert.ok(gen.created.every((s) => s.reason && s.label && s.status === 'suggested'));

    // Suggestions are not in the graph until accepted.
    assert.equal((await u.get('/api/graph')).body.edges.filter((e) => e.kind === 'ai').length, 0);
    const mlSuggestion = gen.created.find((s) => [s.sourceId, s.targetId].includes(ml1.id) && [s.sourceId, s.targetId].includes(ml2.id));
    await u.post(`/api/graph/suggestions/${mlSuggestion.id}/accept`, {});
    assert.equal((await u.get('/api/graph')).body.edges.filter((e) => e.kind === 'ai').length, 1);

    for (const s of (await u.get('/api/graph/suggestions')).body.suggestions) await u.post(`/api/graph/suggestions/${s.id}/dismiss`, {});
    const again = (await u.post('/api/graph/suggestions/generate', {})).body;
    assert.equal(again.created.length, 0, 'decided pairs are never suggested again');

    const rel = (await u.get(`/api/graph/related/${bake.id}`)).body;
    assert.ok(rel.similar.every((s) => s.id !== bake.id));
  });

  it('uses keyword similarity when no embedding provider is configured', async () => {
    useFakeProviders({ chat: false, embeddings: false });
    const u = await makeUser(ctx.app);
    await note(u, 'Volcano eruptions', 'Magma chambers, lava flows and volcanic ash clouds.');
    await note(u, 'Volcanic hazards', 'Lava flows and ash clouds threaten towns near volcanoes.');
    await note(u, 'Jazz chords', 'Seventh chords and voicings for piano.');
    await waitForIdle();
    const gen = (await u.post('/api/graph/suggestions/generate', {})).body;
    assert.equal(gen.method, 'keywords');
    assert.equal(gen.created.length, 1);
    assert.match(gen.created[0].reason, /lava|ash|clouds|flows/);
  });
});

describe('knowledge timeline', () => {
  it('records activity across the app and filters it by type and date', async () => {
    const u = await makeUser(ctx.app);
    const n = await note(u, 'First note', 'hello');
    await u.post('/api/collections', { name: 'Reading' });
    const link = (await u.post('/api/resources/links', { url: 'https://example.invalid/x' })).body.resource;
    await u.get('/api/search?q=hello&record=true');
    const m = await note(u, 'Second', 'world');
    await u.post('/api/graph/connections', { sourceId: n.id, targetId: m.id });
    const conv = (await u.post('/api/conversations', {})).body.conversation;
    await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(u.auth).send({ content: 'What is entropy?', mode: 'general', clientRequestId: crypto.randomUUID() }).buffer(true).parse(sseParser);
    await u.get(`/api/resources/${link.id}`);
    await u.get(`/api/resources/${link.id}`); // a second open within 30 min is not logged again
    await waitForIdle();

    const all = (await u.get('/api/timeline')).body.items;
    const types = all.map((a) => a.type);
    for (const t of ['note_created', 'collection_created', 'link_saved', 'search', 'connection_created', 'conversation_started', 'resource_opened']) {
      assert.ok(types.includes(t), `missing ${t}`);
    }
    assert.equal(types.filter((t) => t === 'resource_opened').length, 1);
    assert.equal(all.find((a) => a.type === 'conversation_started').title, 'What is entropy?');

    const notesOnly = (await u.get('/api/timeline?types=note_created')).body.items;
    assert.deepEqual(notesOnly.map((a) => a.title), ['Second', 'First note']);

    const page1 = (await u.get('/api/timeline?limit=3')).body;
    assert.equal(page1.items.length, 3);
    assert.equal(page1.hasMore, true);
    const page2 = (await u.get(`/api/timeline?limit=50&before=${encodeURIComponent(page1.nextBefore)}`)).body;
    assert.equal(page1.items.length + page2.items.length, all.length);

    assert.equal((await u.get('/api/timeline?from=2000-01-01&to=2000-12-31')).body.items.length, 0);
    const summary = (await u.get('/api/timeline/summary?days=30&tz=Europe/London')).body;
    assert.equal(summary.totals.note_created, 2);
    assert.equal((await u.get('/api/timeline/summary?tz=Not/AZone')).status, 400);

    await u.del(`/api/resources/${n.id}`);
    const after = (await u.get('/api/timeline?types=note_created')).body.items;
    assert.equal(after.find((a) => a.title === 'First note').resourceExists, false);
  });

  it('backfills history for content created before activity tracking existed', async () => {
    const u = await makeUser(ctx.app);
    await Resource.create({ user: u.user.id, type: 'note', title: 'Old note', note: { content: doc('x'), revision: 1 }, createdAt: new Date('2025-02-02') });
    await User.updateOne({ _id: u.user.id }, { $set: { timelineBackfilledAt: null } });
    await Activity.deleteMany({ user: u.user.id });
    const items = (await u.get('/api/timeline')).body.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Old note');
    assert.equal(new Date(items[0].at).toISOString().slice(0, 10), '2025-02-02');
    assert.equal((await u.get('/api/timeline')).body.items.length, 1, 'backfill runs once');
  });
});

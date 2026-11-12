import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import Chunk from '../src/models/Chunk.js';
import Message from '../src/models/Message.js';
import Conversation from '../src/models/Conversation.js';
import { waitForIdle } from '../src/processing/queue.js';
import { vectorSearch } from '../src/ai/vectorSearch.js';
import { calls, parseSse, sseParser, useFakeProviders } from './fakeProviders.js';
import { doc, heading, makeUser, startTestApp } from './helpers.js';

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

const rid = () => crypto.randomUUID();

async function newConversation(u) {
  const res = await u.post('/api/conversations', {});
  assert.equal(res.status, 201);
  return res.body.conversation;
}

function send(u, convId, content, mode = 'general', clientRequestId = rid()) {
  return request(ctx.app)
    .post(`/api/conversations/${convId}/messages`)
    .set(u.auth)
    .send({ content, mode, clientRequestId })
    .buffer(true)
    .parse(sseParser);
}

const eventsOf = (res) => parseSse(res.body);

describe('assistant configuration', () => {
  it('refuses to answer (no fake response) when no AI provider is configured', async () => {
    useFakeProviders({ chat: false, embeddings: false });
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const res = await request(ctx.app).post(`/api/conversations/${c.id}/messages`).set(u.auth).send({ content: 'Hi', mode: 'general', clientRequestId: rid() });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'AI_NOT_CONFIGURED');
    assert.equal(await Message.countDocuments(), 0);
    const status = await u.get('/api/ai/status');
    assert.equal(status.body.chat.configured, false);
    assert.equal(status.body.embeddings.configured, false);
  });
});

describe('general AI mode', () => {
  it('streams an answer, persists it, titles the conversation and suggests follow-ups', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const res = await send(u, c.id, 'Explain photosynthesis');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/event-stream/);
    const ev = eventsOf(res);
    assert.deepEqual([...new Set(ev.map((e) => e.event))], ['start', 'status', 'delta', 'done', 'meta', 'end']);
    const streamed = ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    const done = ev.find((e) => e.event === 'done').data.message;
    assert.equal(done.content, streamed);
    assert.equal(done.status, 'complete');
    assert.equal(done.citations.length, 0);
    assert.equal(ev.find((e) => e.event === 'meta').data.conversation.title, 'Fake Title');

    const stored = await u.get(`/api/conversations/${c.id}`);
    assert.equal(stored.body.messages.length, 2);
    assert.deepEqual(stored.body.messages[1].followUps, ['What next?', 'Tell me more?']);
    assert.equal(stored.body.conversation.messageCount, 2);
  });

  it('keeps conversation context across turns and when switching modes', async () => {
    const u = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'n', content: doc('something saved') });
    const c = await newConversation(u);
    await send(u, c.id, 'My name is Ada');
    await send(u, c.id, 'What is my name?', 'knowledge');
    const lastCall = calls.chat.at(-1);
    assert.equal(lastCall.messages.length, 3, 'previous user + assistant turns are included');
    assert.equal(lastCall.messages[0].content, 'My name is Ada');
    assert.match(lastCall.system, /My Knowledge mode/);
    const convo = (await u.get(`/api/conversations/${c.id}`)).body.conversation;
    assert.equal(convo.mode, 'knowledge');
  });

  it('rejects duplicate submissions and concurrent generations', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const id = rid();
    await send(u, c.id, 'once', 'general', id);
    const dup = await request(ctx.app).post(`/api/conversations/${c.id}/messages`).set(u.auth).send({ content: 'once', mode: 'general', clientRequestId: id });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'DUPLICATE_REQUEST');

    // supertest requests are lazy; .then() starts it now.
    const slow = send(u, c.id, 'SLOW please').then((r) => r);
    await new Promise((r) => setTimeout(r, 150));
    const second = await request(ctx.app).post(`/api/conversations/${c.id}/messages`).set(u.auth).send({ content: 'meanwhile', mode: 'general', clientRequestId: rid() });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'GENERATION_IN_PROGRESS');
    await slow;
    assert.equal((await Conversation.findById(c.id)).generatingSince, null, 'lock released');
  });

  it('saves a partial answer as "stopped" when the client disconnects', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const server = ctx.app.listen(0);
    const port = server.address().port;
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/conversations/${c.id}/messages`, {
      method: 'POST',
      headers: { ...u.auth, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'SLOW story', mode: 'general', clientRequestId: rid() }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    let got = '';
    while (!got.includes('event: delta')) got += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    await new Promise((r) => setTimeout(r, 400));
    server.close();
    const answer = await Message.findOne({ conversation: c.id, role: 'assistant' }).lean();
    assert.equal(answer.status, 'stopped');
    assert.ok(answer.content.length > 0 && answer.content.length < 100);
    assert.equal((await Conversation.findById(c.id)).generatingSince, null);
  });

  it('records provider failures on the message and streams an error event', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const ev = eventsOf(await send(u, c.id, 'EXPLODE'));
    const err = ev.find((e) => e.event === 'error');
    assert.match(err.data.message, /temporarily unavailable/);
    const answer = await Message.findById(err.data.messageId).lean();
    assert.equal(answer.status, 'error');
    assert.equal(answer.content, 'Partial ');
  });

  it('regenerates only the latest answer', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const first = eventsOf(await send(u, c.id, 'first question')).find((e) => e.event === 'done').data.message;
    const second = eventsOf(await send(u, c.id, 'second question')).find((e) => e.event === 'done').data.message;
    const old = await u.post(`/api/conversations/${c.id}/messages/${first.id}/regenerate`, {});
    assert.equal(old.status, 400);
    const regen = await request(ctx.app).post(`/api/conversations/${c.id}/messages/${second.id}/regenerate`).set(u.auth).send({}).buffer(true).parse(sseParser);
    const done = eventsOf(regen).find((e) => e.event === 'done').data.message;
    assert.notEqual(done.id, second.id);
    const msgs = (await u.get(`/api/conversations/${c.id}`)).body.messages;
    assert.equal(msgs.length, 4);
    assert.equal(msgs.at(-1).id, done.id);
  });
});

describe('My Knowledge mode (RAG)', () => {
  it('explains an empty library instead of calling the model', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const ev = eventsOf(await send(u, c.id, 'What do my notes say?', 'knowledge'));
    const done = ev.find((e) => e.event === 'done').data.message;
    assert.equal(done.kind, 'notice');
    assert.match(done.content, /Knowledge Vault is empty/);
    assert.equal(done.retrieval.note, 'EMPTY_LIBRARY');
    assert.equal(calls.chat.length, 0);
  });

  it('retrieves the user’s own passages, cites only real sources, and never another user’s content', async () => {
    const alice = await makeUser(ctx.app, 'Alice');
    const bob = await makeUser(ctx.app, 'Bob');
    await alice.post('/api/resources/notes', { title: 'Backpropagation', content: doc(heading('Gradients'), 'Backpropagation computes gradients that flow backwards through the network layers.') });
    await alice.post('/api/resources/notes', { title: 'Baking', content: doc('Sourdough needs a lively starter and patience.') });
    await bob.post('/api/resources/notes', { title: 'Bob secret backpropagation', content: doc('Bob private gradients backwards network layers secret.') });
    await waitForIdle();

    const c = await newConversation(alice);
    const ev = eventsOf(await send(alice, c.id, 'How do gradients flow backwards through network layers?', 'knowledge'));
    const sources = ev.find((e) => e.event === 'sources').data;
    assert.ok(sources.passages.length >= 1);
    assert.equal(sources.passages[0].title, 'Backpropagation');
    assert.ok(sources.passages.every((p) => !p.title.startsWith('Bob')), 'no cross-user retrieval');
    assert.match(sources.retrieval.strategy, /hybrid/);

    const done = ev.find((e) => e.event === 'done').data.message;
    const cited = done.citations.filter((x) => x.cited);
    assert.equal(cited.length, 1, 'only [1] is a real retrieved passage; [9] is ignored');
    assert.equal(cited[0].n, 1);
    assert.equal(cited[0].title, 'Backpropagation');
    assert.equal(cited[0].resourceType, 'note');
    assert.ok(cited[0].resourceId && cited[0].excerpt.includes('Backpropagation'));
    assert.ok(done.citations.every((x) => x.n <= sources.passages.length));

    // The model saw the passages as sources plus the guardrail instructions.
    const call = calls.chat.at(-1);
    assert.match(call.messages.at(-1).content, /<source n="1" title="Backpropagation" type="note"/);
    assert.doesNotMatch(call.messages.at(-1).content, /Bob private/);
    assert.match(call.system, /Never invent a source/);
  });

  it('falls back to keyword retrieval and says so when no embedding provider is set', async () => {
    useFakeProviders({ chat: true, embeddings: false });
    const u = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'Volcanoes', content: doc('Magma rises through the crust.') });
    await waitForIdle();
    const c = await newConversation(u);
    const ev = eventsOf(await send(u, c.id, 'What do I know about magma?', 'knowledge'));
    const sources = ev.find((e) => e.event === 'sources').data;
    assert.equal(sources.retrieval.strategy, 'keyword');
    assert.match(sources.retrieval.note, /keyword search was used/);
    assert.equal(sources.passages[0].title, 'Volcanoes');
  });

  it('tells the model when nothing relevant was found', async () => {
    const u = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'Knitting', content: doc('Purl and knit stitches.') });
    await waitForIdle();
    const c = await newConversation(u);
    const ev = eventsOf(await send(u, c.id, 'quantum chromodynamics lattice', 'knowledge'));
    assert.equal(ev.find((e) => e.event === 'sources').data.passages.length, 0);
    const done = ev.find((e) => e.event === 'done').data.message;
    assert.match(done.content, /don't cover/);
    assert.equal(done.citations.length, 0);
  });
});

describe('embedding pipeline', () => {
  it('embeds new content once, re-embeds only changed passages, and records the model', async () => {
    const u = await makeUser(ctx.app);
    const long = (word) => Array.from({ length: 30 }, (_, i) => `${word} sentence number ${i} about ${word}.`).join(' ');
    const note = (await u.post('/api/resources/notes', { title: 'Topics', content: doc(heading('Alpha'), long('alpha'), heading('Beta'), long('beta')) })).body.resource;
    await waitForIdle();
    const chunks = await Chunk.find({ resource: note.id }).select('+embedding').lean();
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.embeddingModel === 'fake:fake-embed:64' && c.embedding.length === 64 && c.textHash));
    const firstRun = calls.embed.reduce((n, c) => n + c.count, 0);
    assert.equal(firstRun, chunks.length);

    const r = (await u.get(`/api/resources/${note.id}?touch=false`)).body.resource;
    assert.equal(r.semanticIndex.status, 'ready');
    assert.equal(r.semanticIndex.model, 'fake:fake-embed:64');

    // Change only the Beta section: Alpha passages keep their vectors.
    await u.patch(`/api/resources/${note.id}`, { baseRevision: r.note.revision, content: doc(heading('Alpha'), long('alpha'), heading('Beta'), long('gamma')) });
    await waitForIdle();
    const secondRun = calls.embed.reduce((n, c) => n + c.count, 0) - firstRun;
    const now = await Chunk.find({ resource: note.id }).lean();
    assert.ok(secondRun > 0 && secondRun < now.length, `re-embedded ${secondRun} of ${now.length}`);
    assert.ok(now.every((c) => c.embeddingModel === 'fake:fake-embed:64'));

    // Saving identical content embeds nothing.
    const before = calls.embed.length;
    const r2 = (await u.get(`/api/resources/${note.id}?touch=false`)).body.resource;
    await u.patch(`/api/resources/${note.id}`, { baseRevision: r2.note.revision, content: doc(heading('Alpha'), long('alpha'), heading('Beta'), long('gamma')) });
    await waitForIdle();
    assert.equal(calls.embed.length, before);
  });

  it('marks items "disabled" without a provider and backfills via reindex later', async () => {
    useFakeProviders({ chat: true, embeddings: false });
    const u = await makeUser(ctx.app);
    const n = (await u.post('/api/resources/notes', { title: 'Old note', content: doc('Phase two content') })).body.resource;
    await waitForIdle();
    assert.equal((await u.get(`/api/resources/${n.id}?touch=false`)).body.resource.semanticIndex.status, 'disabled');
    assert.equal((await u.post('/api/ai/reindex', {})).status, 503);

    useFakeProviders({ chat: true, embeddings: true });
    const re = await u.post('/api/ai/reindex', {});
    assert.equal(re.status, 202);
    assert.equal(re.body.queued, 1);
    await waitForIdle();
    assert.equal((await u.get(`/api/resources/${n.id}?touch=false`)).body.resource.semanticIndex.status, 'ready');
    const status = await u.get('/api/ai/status');
    assert.equal(status.body.embeddings.configured, true);
    assert.equal(status.body.index.embeddedPassages, 1);
    assert.equal(status.body.vectorSearch, 'local', 'in-memory MongoDB has no $vectorSearch, so local search is used');
  });

  it('local vector search ranks by similarity and is scoped to the user', async () => {
    const a = await makeUser(ctx.app);
    const b = await makeUser(ctx.app);
    await a.post('/api/resources/notes', { title: 'Ocean', content: doc('Whales dolphins coral reef ocean currents.') });
    await a.post('/api/resources/notes', { title: 'Desert', content: doc('Cactus dunes camel arid heat.') });
    await b.post('/api/resources/notes', { title: 'B ocean', content: doc('Whales dolphins coral reef ocean currents.') });
    await waitForIdle();
    const { embed } = (await import('../src/ai/providers.js')).getEmbeddingProvider();
    const [q] = await embed(['whales and coral reef']);
    const { hits, strategy } = await vectorSearch(a.user.id, q, 'fake:fake-embed:64', { limit: 5 });
    assert.equal(strategy, 'local');
    assert.equal(hits.length, 2);
    assert.match(hits[0].text, /Whales/);
    assert.ok(hits[0].score > hits[1].score);
  });
});

describe('conversations', () => {
  it('lists, renames, deletes and isolates conversations', async () => {
    const a = await makeUser(ctx.app);
    const b = await makeUser(ctx.app);
    const c = await newConversation(a);
    await send(a, c.id, 'hello');
    const list = await a.get('/api/conversations');
    assert.equal(list.body.conversations.length, 1);

    const renamed = await a.patch(`/api/conversations/${c.id}`, { title: 'My chat' });
    assert.equal(renamed.body.conversation.title, 'My chat');
    await send(a, c.id, 'again');
    assert.equal((await a.get(`/api/conversations/${c.id}`)).body.conversation.title, 'My chat', 'auto-title never overrides a rename');

    assert.equal((await b.get(`/api/conversations/${c.id}`)).status, 404);
    assert.equal((await b.patch(`/api/conversations/${c.id}`, { title: 'x' })).status, 404);
    assert.equal((await b.del(`/api/conversations/${c.id}`)).status, 404);
    const intrude = await request(ctx.app).post(`/api/conversations/${c.id}/messages`).set(b.auth).send({ content: 'hi', mode: 'general', clientRequestId: rid() });
    assert.equal(intrude.status, 404);
    assert.equal((await b.get('/api/conversations')).body.conversations.length, 0);

    assert.equal((await a.del(`/api/conversations/${c.id}`)).status, 204);
    assert.equal(await Message.countDocuments({ conversation: c.id }), 0);
  });

  it('summarises older turns when history exceeds the context budget', async () => {
    const u = await makeUser(ctx.app);
    const c = await newConversation(u);
    const big = 'x'.repeat(11000);
    for (let i = 0; i < 5; i++) assert.equal((await send(u, c.id, `${i} ${big}`)).status, 200);
    await send(u, c.id, 'short question');
    const last = calls.chat.at(-1);
    assert.match(last.messages[0].content, /conversation_summary/);
    assert.match(last.messages[0].content, /topic X/);
    const convo = await Conversation.findById(c.id).lean();
    assert.ok(convo.summary && convo.summaryThrough);
  });
});

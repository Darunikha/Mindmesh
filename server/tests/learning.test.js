import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import Flashcard from '../src/models/Flashcard.js';
import Resource from '../src/models/Resource.js';
import { waitForIdle } from '../src/processing/queue.js';
import { schedule, previews } from '../src/modules/flashcards/scheduler.js';
import { markdownToDoc } from '../src/processing/markdownToDoc.js';
import { parseSse, sseParser, useFakeProviders } from './fakeProviders.js';
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

describe('spaced-repetition scheduler', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const days = (d) => Math.round((d - now) / 86400000);

  it('grows intervals with good answers and resets on a lapse', () => {
    let card = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };
    const steps = [];
    for (let i = 0; i < 4; i++) {
      card = { ...card, ...schedule(card, 'good', now) };
      steps.push(card.intervalDays);
    }
    assert.deepEqual(steps, [1, 3, 8, 20]);
    const lapse = schedule(card, 'again', now);
    assert.equal(lapse.repetitions, 0);
    assert.equal(lapse.lapses, 1);
    assert.equal((lapse.dueAt - now) / 60000, 10, 'relearn in 10 minutes');
    assert.ok(lapse.ease < card.ease);
  });

  it('orders grades sensibly and never lets ease collapse', () => {
    const card = { ease: 2.5, intervalDays: 10, repetitions: 3, lapses: 0 };
    const [hard, good, easy] = ['hard', 'good', 'easy'].map((g) => days(schedule(card, g, now).dueAt));
    assert.ok(hard < good && good < easy, `${hard} < ${good} < ${easy}`);
    let c = { ...card };
    for (let i = 0; i < 20; i++) c = { ...c, ...schedule(c, 'again', now) };
    assert.equal(c.ease, 1.3);
    assert.deepEqual(Object.keys(previews(card, now)), ['again', 'hard', 'good', 'easy']);
    assert.equal(previews(card, now).again, '10m');
  });
});

describe('flashcards API', () => {
  it('creates cards by hand, reviews them, and only shows cards that are due', async () => {
    const u = await makeUser(ctx.app);
    const a = (await u.post('/api/flashcards', { front: 'Capital of France?', back: 'Paris' })).body.card;
    await u.post('/api/flashcards', { front: 'Speed of light?', back: '~300,000 km/s' });
    assert.equal(a.isNew, true);
    assert.equal((await u.get('/api/flashcards/stats')).body.due, 2);

    const reviewed = (await u.post(`/api/flashcards/${a.id}/review`, { grade: 'good' })).body.card;
    assert.equal(reviewed.intervalDays, 1);
    assert.equal(reviewed.isNew, false);
    const due = (await u.get('/api/flashcards/due')).body;
    assert.deepEqual(due.cards.map((c) => c.front), ['Speed of light?']);
    const stats = (await u.get('/api/flashcards/stats')).body;
    assert.deepEqual({ total: stats.total, due: stats.due, reviewedToday: stats.reviewedToday }, { total: 2, due: 1, reviewedToday: 1 });

    await u.patch(`/api/flashcards/${due.cards[0].id}`, { suspended: true });
    assert.equal((await u.get('/api/flashcards/due')).body.cards.length, 0, 'suspended cards are not reviewed');
    assert.equal((await u.post(`/api/flashcards/${a.id}/review`, { grade: 'perfect' })).status, 400);
    assert.equal((await u.post('/api/flashcards', { front: '', back: 'x' })).status, 400);
  });

  it('generates cards from an item with AI, skipping duplicates, and requires a provider', async () => {
    const u = await makeUser(ctx.app);
    const note = (await u.post('/api/resources/notes', { title: 'Backprop', content: doc('Backpropagation computes gradients using the chain rule.') })).body.resource;
    const gen = await u.post('/api/flashcards/generate', { resourceId: note.id, count: 5 });
    assert.equal(gen.status, 201, JSON.stringify(gen.body));
    assert.deepEqual(gen.body.cards.map((c) => c.front), ['What does backpropagation compute?', 'Which rule does it rely on?']);
    assert.equal(gen.body.skipped, 1);
    assert.ok(gen.body.cards.every((c) => c.origin === 'ai' && c.resourceTitle === 'Backprop'));

    const again = await u.post('/api/flashcards/generate', { resourceId: note.id, count: 5 });
    assert.equal(again.body.cards.length, 0, 'existing questions are not duplicated');

    useFakeProviders({ chat: false, embeddings: false });
    const off = await u.post('/api/flashcards/generate', { resourceId: note.id });
    assert.equal(off.status, 503);
    assert.equal(off.body.error.code, 'AI_NOT_CONFIGURED');
  });

  it('keeps cards when their source item is deleted, and isolates users', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    const note = (await u.post('/api/resources/notes', { title: 'Source', content: doc('text') })).body.resource;
    const card = (await u.post('/api/flashcards', { front: 'Q', back: 'A', resourceId: note.id })).body.card;
    assert.equal(card.resourceTitle, 'Source');

    assert.equal((await other.get('/api/flashcards')).body.total, 0);
    assert.equal((await other.post(`/api/flashcards/${card.id}/review`, { grade: 'good' })).status, 404);
    assert.equal((await other.del(`/api/flashcards/${card.id}`)).status, 404);
    assert.equal((await other.post('/api/flashcards', { front: 'x', back: 'y', resourceId: note.id })).status, 400, 'cannot attach to another user’s item');

    await u.del(`/api/resources/${note.id}`);
    const kept = await Flashcard.findById(card.id).lean();
    assert.ok(kept, 'card survives');
    assert.equal(kept.resource, null);
  });
});

describe('save answer to vault', () => {
  it('converts Markdown to rich text', () => {
    const d = markdownToDoc('## Title\n\nSome **bold** and `code` and [link](https://x.org).\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n\n> quote\n\n<script>alert(1)</script>');
    const types = d.content.map((n) => n.type);
    assert.deepEqual(types.slice(0, 5), ['heading', 'paragraph', 'bulletList', 'codeBlock', 'blockquote']);
    const marks = d.content[1].content.flatMap((n) => (n.marks || []).map((m) => m.type));
    assert.deepEqual(marks, ['bold', 'code', 'link']);
    assert.equal(d.content[3].attrs.language, 'js');
    assert.ok(!JSON.stringify(d).includes('"type":"html"'));
    assert.deepEqual(markdownToDoc('[bad](javascript:alert(1))').content[0].content[0].marks, undefined, 'unsafe links lose the link mark');
  });

  it('saves a cited answer as a note once, with its question and sources', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'Backpropagation', content: doc('Backpropagation computes gradients that flow backwards through network layers.') });
    await waitForIdle();
    const conv = (await u.post('/api/conversations', {})).body.conversation;
    const ev = parseSse(
      (await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(u.auth).send({ content: 'How do gradients flow backwards through network layers?', mode: 'knowledge', clientRequestId: crypto.randomUUID() }).buffer(true).parse(sseParser)).body
    );
    const answer = ev.find((e) => e.event === 'done').data.message;

    const saved = await u.post(`/api/conversations/${conv.id}/messages/${answer.id}/save`, {});
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const note = (await u.get(`/api/resources/${saved.body.resource.id}`)).body.resource;
    const json = JSON.stringify(note.note.content);
    assert.match(json, /How do gradients flow backwards/, 'the question is quoted');
    assert.match(json, /Sources/);
    assert.match(json, /\/vault\//, 'sources link to the original items');
    assert.deepEqual(note.tags.map((t) => t.name), ['from assistant']);

    const again = await u.post(`/api/conversations/${conv.id}/messages/${answer.id}/save`, {});
    assert.equal(again.status, 200);
    assert.equal(again.body.resource.id, saved.body.resource.id, 'saving twice returns the same note');
    assert.equal(await Resource.countDocuments({ title: note.title }), 1);
    assert.equal((await u.get(`/api/conversations/${conv.id}`)).body.messages.at(-1).savedResourceId, saved.body.resource.id);

    assert.equal((await other.post(`/api/conversations/${conv.id}/messages/${answer.id}/save`, {})).status, 404);
    const question = (await u.get(`/api/conversations/${conv.id}`)).body.messages[0];
    assert.equal((await u.post(`/api/conversations/${conv.id}/messages/${question.id}/save`, {})).status, 404, 'only answers can be saved');
  });
});

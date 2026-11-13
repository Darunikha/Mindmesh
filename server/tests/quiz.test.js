import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Flashcard from '../src/models/Flashcard.js';
import Quiz from '../src/models/Quiz.js';
import { registerChatProvider, resetProviders } from '../src/ai/index.js';
import env from '../src/config/env.js';
import { waitForIdle } from '../src/processing/queue.js';
import { useFakeProviders } from './fakeProviders.js';
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

const seed = async (u) => (await u.post('/api/resources/notes', { title: 'Backprop', content: doc('Backpropagation computes gradients with the chain rule, layer by layer.') })).body.resource;

describe('quizzes', () => {
  it('writes questions from the user’s own text, hides answers until graded, and grades fairly', async () => {
    const u = await makeUser(ctx.app);
    const note = await seed(u);
    await waitForIdle();

    const start = await u.post('/api/quizzes', { scope: { type: 'resource', id: note.id }, count: 6 });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    const quiz = start.body.quiz;
    assert.equal(quiz.total, 2, 'the question pointing at a non-existent passage is dropped');
    assert.ok(quiz.questions.every((q) => q.reference === undefined && q.source === undefined), 'no answers leak before grading');
    const stored = await Quiz.findById(quiz.id).lean();
    assert.equal(stored.questions[0].sourceTitle, 'Backprop');

    const a1 = (await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'It applies the chain rule layer by layer' })).body.quiz;
    assert.equal(a1.questions[0].verdict, 'correct');
    assert.equal(a1.questions[0].reference, 'Using the chain rule, layer by layer.');
    assert.equal(a1.questions[0].source.title, 'Backprop');
    assert.equal(a1.questions[0].source.resourceId, note.id);
    assert.equal(a1.questions[1].reference, undefined, 'unanswered questions stay hidden');
    assert.equal(a1.status, 'active');

    assert.equal((await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'again' })).status, 409);
    const a2 = (await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 1, answer: 'no idea' })).body.quiz;
    assert.equal(a2.status, 'complete');
    assert.equal(a2.score, 50, 'one correct + one incorrect');
    assert.equal((await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 5, answer: 'x' })).status, 400);
    assert.equal((await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: '   ' })).status, 400);
    assert.equal((await u.get('/api/quizzes')).body.quizzes[0].score, 50);
  });

  it('turns missed questions into flashcards once, keeping the source link', async () => {
    const u = await makeUser(ctx.app);
    const note = await seed(u);
    await waitForIdle();
    const quiz = (await u.post('/api/quizzes', { scope: { type: 'all' }, count: 6 })).body.quiz;
    await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'chain rule' });
    await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 1, answer: 'something unrelated' });

    const made = (await u.post(`/api/quizzes/${quiz.id}/flashcards`, {})).body;
    assert.equal(made.created, 1);
    const card = await Flashcard.findOne({ user: u.user.id }).lean();
    assert.equal(card.front, 'What flows backwards?');
    assert.equal(card.back, 'Gradients of the loss.');
    assert.equal(String(card.resource), note.id);
    assert.equal((await u.post(`/api/quizzes/${quiz.id}/flashcards`, {})).body.created, 0, 'no duplicates on a second click');
  });

  it('handles empty libraries, missing AI and provider failures honestly', async () => {
    const u = await makeUser(ctx.app);
    const empty = await u.post('/api/quizzes', { scope: { type: 'all' } });
    assert.equal(empty.status, 400);
    assert.match(empty.body.error.message, /no processed text/);

    const note = await seed(u);
    await waitForIdle();
    const quiz = (await u.post('/api/quizzes', { scope: { type: 'resource', id: note.id } })).body.quiz;
    const failed = await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'BOOM' });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, 'GRADING_FAILED');
    assert.equal((await Quiz.findById(quiz.id)).questions[0].verdict, null, 'a failed grading does not consume the question');

    // A provider outage keeps its friendly message and status (not a generic 500).
    registerChatProvider('flaky', () => ({
      name: 'flaky',
      model: 'x',
      completeJson: async () => {
        throw Object.assign(new Error('The AI provider is rate-limiting requests. Please wait a moment and try again.'), { code: 'AI_RATE_LIMITED', status: 429 });
      },
    }));
    env.AI_PROVIDER = 'flaky';
    resetProviders();
    const limited = await u.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'chain rule' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'AI_RATE_LIMITED');

    useFakeProviders({ chat: false, embeddings: false });
    const off = await u.post('/api/quizzes', { scope: { type: 'resource', id: note.id } });
    assert.equal(off.status, 503);
    assert.equal(off.body.error.code, 'AI_NOT_CONFIGURED');
  });

  it('scopes to the user, and past quizzes survive a deleted source', async () => {
    const a = await makeUser(ctx.app);
    const b = await makeUser(ctx.app);
    const note = await seed(a);
    await waitForIdle();
    const quiz = (await a.post('/api/quizzes', { scope: { type: 'resource', id: note.id } })).body.quiz;

    assert.equal((await b.get(`/api/quizzes/${quiz.id}`)).status, 404);
    assert.equal((await b.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'x' })).status, 404);
    assert.equal((await b.post('/api/quizzes', { scope: { type: 'resource', id: note.id } })).status, 400, 'cannot quiz on another user’s item');
    assert.equal((await b.get('/api/quizzes')).body.quizzes.length, 0);

    await a.post(`/api/quizzes/${quiz.id}/answer`, { index: 0, answer: 'chain rule' });
    await a.del(`/api/resources/${note.id}`);
    const kept = (await a.get(`/api/quizzes/${quiz.id}`)).body.quiz;
    assert.equal(kept.questions[0].source.resourceId, null);
    assert.equal(kept.questions[0].source.title, 'Backprop');
  });
});

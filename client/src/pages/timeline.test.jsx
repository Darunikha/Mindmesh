import { describe, expect, it } from 'vitest';
import { ACTIVITY, activityDetail, activityTitle, href } from './TimelinePage.jsx';

describe('timeline entries for reviews and quizzes', () => {
  it('describes a review session in plain words', () => {
    expect(activityTitle({ type: 'flashcards_reviewed', meta: { count: 12 } })).toBe('12 flashcards');
    expect(activityTitle({ type: 'flashcards_reviewed', meta: { count: 1 } })).toBe('1 flashcard');
    expect(href({ type: 'flashcards_reviewed' })).toBe('/flashcards');
  });

  it('shows a quiz name, its score, and links back to that quiz', () => {
    const quiz = { type: 'quiz_completed', title: 'Backprop', meta: { quizId: 'abc', score: 75, total: 4 } };
    expect(activityTitle(quiz)).toBe('Backprop');
    expect(activityDetail(quiz)).toBe('Score 75% · 4 questions');
    expect(activityDetail({ ...quiz, meta: { ...quiz.meta, total: 1 } })).toBe('Score 75% · 1 question');
    expect(href(quiz)).toBe('/quiz?id=abc');
  });

  it('keeps existing entries unchanged', () => {
    expect(activityTitle({ type: 'search', title: 'lava' })).toBe('“lava”');
    expect(activityDetail({ type: 'search', meta: { resultCount: 3 } })).toBe('3 results');
    expect(href({ type: 'note_created', resourceId: 'r1', resourceExists: true })).toBe('/vault/r1');
    expect(href({ type: 'note_created', resourceId: 'r1', resourceExists: false })).toBeNull();
  });

  it('offers a filter chip for every activity type', () => {
    expect(Object.keys(ACTIVITY)).toEqual(expect.arrayContaining(['flashcards_reviewed', 'quiz_completed']));
    for (const meta of Object.values(ACTIVITY)) expect(meta.label && meta.verb && meta.icon).toBeTruthy();
  });
});

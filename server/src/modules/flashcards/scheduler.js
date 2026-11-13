/**
 * SM-2 style spaced-repetition scheduling (the family of algorithms behind Anki).
 * Grades: again | hard | good | easy. Pure functions so they are easy to test.
 */
export const GRADES = ['again', 'hard', 'good', 'easy'];
const DAY = 24 * 60 * 60 * 1000;
const RELEARN_MINUTES = 10;
const MIN_EASE = 1.3;
const MAX_INTERVAL = 3650;

export function schedule(card, grade, now = new Date()) {
  let { ease = 2.5, intervalDays = 0, repetitions = 0, lapses = 0 } = card;

  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, ease - 0.2),
      intervalDays: 0,
      repetitions: 0,
      lapses: lapses + 1,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000),
    };
  }

  let next;
  if (grade === 'hard') {
    next = repetitions === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (grade === 'good') {
    next = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(intervalDays + 1, Math.round(intervalDays * ease));
  } else {
    next = repetitions === 0 ? 4 : Math.max(intervalDays + 1, Math.round(intervalDays * ease * 1.3));
    ease += 0.15;
  }
  next = Math.min(MAX_INTERVAL, next);
  return { ease: Number(ease.toFixed(3)), intervalDays: next, repetitions: repetitions + 1, lapses, dueAt: new Date(now.getTime() + next * DAY) };
}

/** Human-readable preview of when each grade would bring the card back ("10m", "3d", "2mo"). */
export function previews(card, now = new Date()) {
  const out = {};
  for (const g of GRADES) {
    const ms = schedule(card, g, now).dueAt - now;
    const days = ms / DAY;
    out[g] = days < 1 ? `${Math.round(ms / 60000)}m` : days < 30 ? `${Math.round(days)}d` : days < 365 ? `${Math.round(days / 30)}mo` : `${(days / 365).toFixed(1)}y`;
  }
  return out;
}

import Activity from '../../models/Activity.js';

/**
 * Records a timeline event. Logging must never break the action that triggered it,
 * so failures are swallowed (and reported in development).
 */
export function logActivity(userId, type, { resource = null, collectionRef = null, conversation = null, title = '', meta = {}, at } = {}) {
  return Activity.create({ user: userId, type, resource, collectionRef, conversation, title: String(title).slice(0, 300), meta, ...(at ? { at } : {}) }).catch((err) => {
    if (process.env.NODE_ENV !== 'test') console.warn('[mindmesh] Could not record activity:', err.message);
  });
}

/** A run of reviews counts as one session; a gap of this long starts a new one. */
const REVIEW_SESSION_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Groups flashcard reviews into sessions so the timeline shows "Reviewed 12 flashcards"
 * once, instead of one entry per card. The entry's time is when the session began.
 */
export async function logReviewSession(userId, now = new Date()) {
  try {
    const bumped = await Activity.findOneAndUpdate(
      { user: userId, type: 'flashcards_reviewed', 'meta.lastAt': { $gte: new Date(now.getTime() - REVIEW_SESSION_GAP_MS) } },
      { $inc: { 'meta.count': 1 }, $set: { 'meta.lastAt': now } },
      { sort: { at: -1 }, returnDocument: 'after' }
    );
    if (!bumped) await Activity.create({ user: userId, type: 'flashcards_reviewed', title: '', meta: { count: 1, lastAt: now }, at: now });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.warn('[mindmesh] Could not record review activity:', err.message);
  }
}

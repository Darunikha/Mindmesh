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

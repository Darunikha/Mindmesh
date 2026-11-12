import mongoose from 'mongoose';
import Activity from '../../models/Activity.js';
import Resource from '../../models/Resource.js';
import Collection from '../../models/Collection.js';
import Conversation from '../../models/Conversation.js';
import Connection from '../../models/Connection.js';
import User from '../../models/User.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const TYPE_FOR_RESOURCE = { note: 'note_created', document: 'document_uploaded', link: 'link_saved' };

/**
 * Activities started being recorded in Phase 4. The first time a user opens the timeline,
 * reconstruct creation events from existing data so the history is complete.
 */
export async function ensureBackfilled(user) {
  if (user.timelineBackfilledAt) return;
  const userId = user._id;
  // Skip anything that already has an event (items created after tracking began).
  const existing = await Activity.find(
    { user: userId, type: { $in: ['note_created', 'document_uploaded', 'link_saved', 'collection_created', 'conversation_started', 'connection_created'] } },
    { resource: 1, collectionRef: 1, conversation: 1, type: 1, 'meta.connectionId': 1 }
  ).lean();
  const seen = new Set(
    existing.flatMap((a) =>
      a.type === 'connection_created'
        ? [`x:${a.meta?.connectionId}`]
        : [a.resource && `r:${a.resource}`, a.collectionRef && `c:${a.collectionRef}`, a.conversation && `v:${a.conversation}`].filter(Boolean)
    )
  );
  const [allResources, allCollections, allConversations, allConnections] = await Promise.all([
    Resource.find({ user: userId }, { title: 1, type: 1, createdAt: 1 }).lean(),
    Collection.find({ user: userId }, { name: 1, createdAt: 1 }).lean(),
    Conversation.find({ user: userId, messageCount: { $gt: 0 } }, { title: 1, mode: 1, createdAt: 1 }).lean(),
    Connection.find({ user: userId, status: 'accepted' }, { a: 1, b: 1, kind: 1, createdAt: 1 }).lean(),
  ]);
  const resources = allResources.filter((r) => !seen.has(`r:${r._id}`));
  const collections = allCollections.filter((c) => !seen.has(`c:${c._id}`));
  const conversations = allConversations.filter((c) => !seen.has(`v:${c._id}`));
  const connections = allConnections.filter((c) => !seen.has(`x:${c._id}`));
  const titles = new Map(allResources.map((r) => [String(r._id), r.title]));
  const docs = [
    ...resources.map((r) => ({ user: userId, type: TYPE_FOR_RESOURCE[r.type], resource: r._id, title: r.title, meta: { resourceType: r.type, backfilled: true }, at: r.createdAt })),
    ...collections.map((c) => ({ user: userId, type: 'collection_created', collectionRef: c._id, title: c.name, meta: { backfilled: true }, at: c.createdAt })),
    ...conversations.map((c) => ({ user: userId, type: 'conversation_started', conversation: c._id, title: c.title, meta: { mode: c.mode, backfilled: true }, at: c.createdAt })),
    ...connections.map((c) => ({
      user: userId,
      type: 'connection_created',
      resource: c.a,
      title: `${titles.get(String(c.a)) || 'Item'} ↔ ${titles.get(String(c.b)) || 'Item'}`,
      meta: { kind: c.kind, connectionId: String(c._id), backfilled: true },
      at: c.createdAt,
    })),
  ];
  if (docs.length) await Activity.insertMany(docs, { ordered: false });
  await User.updateOne({ _id: userId }, { $set: { timelineBackfilledAt: new Date() } }, { timestamps: false });
}

function filterFor(userId, q) {
  const f = { user: oid(userId) };
  if (q.types?.length) f.type = { $in: q.types };
  if (q.from || q.to || q.before) {
    f.at = {};
    if (q.from) f.at.$gte = new Date(q.from);
    if (q.to) f.at.$lte = new Date(q.to);
    if (q.before) f.at.$lt = new Date(q.before);
  }
  return f;
}

/** Paged by time cursor (`before`) so new events never shift pages. */
export async function listActivity(userId, q) {
  const rows = await Activity.find(filterFor(userId, q)).sort({ at: -1, _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  // Mark events whose item has since been deleted, so the UI doesn't link to a 404.
  const resourceIds = [...new Set(page.filter((a) => a.resource).map((a) => String(a.resource)))];
  const alive = new Set((await Resource.find({ _id: { $in: resourceIds.map(oid) }, user: userId }, { _id: 1 }).lean()).map((r) => String(r._id)));
  return {
    items: page.map((a) => ({
      id: String(a._id),
      type: a.type,
      title: a.title,
      at: a.at,
      resourceId: a.resource ? String(a.resource) : null,
      resourceExists: a.resource ? alive.has(String(a.resource)) : null,
      collectionId: a.collectionRef ? String(a.collectionRef) : null,
      conversationId: a.conversation ? String(a.conversation) : null,
      meta: a.meta || {},
    })),
    hasMore: rows.length > q.limit,
    nextBefore: page.length ? page.at(-1).at : null,
  };
}

/** Per-day counts by type for the activity heat strip, bucketed in the viewer's time zone. */
export async function summary(userId, { days, tz }) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await Activity.aggregate([
    { $match: { user: oid(userId), at: { $gte: from } } },
    { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: tz } }, type: '$type' }, n: { $sum: 1 } } },
  ]);
  const byDay = {};
  const totals = {};
  for (const r of rows) {
    byDay[r._id.day] ||= {};
    byDay[r._id.day][r._id.type] = r.n;
    totals[r._id.type] = (totals[r._id.type] || 0) + r.n;
  }
  return { from, days, byDay, totals };
}

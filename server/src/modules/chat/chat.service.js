import mongoose from 'mongoose';
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import ApiError from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/validators.js';

export function serializeConversation(c) {
  return {
    id: String(c._id),
    title: c.title,
    titleLocked: Boolean(c.titleLocked),
    mode: c.mode,
    messageCount: c.messageCount,
    lastMessageAt: c.lastMessageAt,
    generating: Boolean(c.generatingSince),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function serializeMessage(m) {
  return {
    id: String(m._id),
    conversationId: String(m.conversation),
    role: m.role,
    kind: m.kind,
    mode: m.mode,
    content: m.content,
    status: m.status,
    error: m.error,
    errorCode: m.errorCode,
    citations: (m.citations || []).map((c) => ({
      n: c.n,
      chunkId: String(c.chunkId),
      resourceId: String(c.resourceId),
      resourceType: c.resourceType,
      title: c.title,
      excerpt: c.excerpt,
      page: c.page,
      pageEnd: c.pageEnd,
      heading: c.heading,
      similarity: c.similarity,
      matchedBy: c.matchedBy,
      cited: c.cited,
      resourceDeleted: Boolean(c.resourceDeleted),
    })),
    retrieval: m.retrieval?.searched || m.retrieval?.note ? m.retrieval : null,
    followUps: m.followUps || [],
    truncated: Boolean(m.truncated),
    model: m.model,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function findOwnedConversation(userId, id) {
  const c = await Conversation.findOne({ _id: id, user: userId });
  if (!c) throw ApiError.notFound('Conversation not found');
  return c;
}

export async function listConversations(userId, { q, limit = 50, before } = {}) {
  const filter = { user: userId };
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (before) filter.lastMessageAt = { $lt: new Date(before) };
  const items = await Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(limit + 1).lean();
  return { conversations: items.slice(0, limit).map(serializeConversation), hasMore: items.length > limit };
}

export async function createConversation(userId, { title, mode = 'general' } = {}) {
  const c = await Conversation.create({ user: userId, mode, ...(title ? { title, titleLocked: true } : {}) });
  return serializeConversation(c);
}

export async function getConversation(userId, id) {
  const c = await findOwnedConversation(userId, id);
  // Generation locks older than a few minutes belong to crashed requests; clear them.
  if (c.generatingSince && Date.now() - c.generatingSince.getTime() > 3 * 60 * 1000) {
    c.generatingSince = null;
    await c.save();
    await Message.updateMany({ conversation: c._id, status: 'streaming' }, { $set: { status: 'error', error: 'This response was interrupted.' } });
  }
  const messages = await Message.find({ conversation: c._id, user: userId }).sort({ createdAt: 1, _id: 1 }).lean();
  return { conversation: serializeConversation(c), messages: messages.map(serializeMessage) };
}

export async function updateConversation(userId, id, { title, mode }) {
  const c = await findOwnedConversation(userId, id);
  if (title !== undefined) {
    c.title = title;
    c.titleLocked = true;
  }
  if (mode) c.mode = mode;
  await c.save();
  return serializeConversation(c);
}

export async function deleteConversation(userId, id) {
  const c = await Conversation.findOneAndDelete({ _id: id, user: userId });
  if (!c) throw ApiError.notFound('Conversation not found');
  await Message.deleteMany({ conversation: c._id });
}

export async function deleteAllForUser(userId) {
  await Promise.all([Conversation.deleteMany({ user: userId }), Message.deleteMany({ user: userId })]);
}

/** Atomically takes the per-conversation generation lock (stale locks expire after 3 minutes). */
export async function acquireLock(userId, id) {
  const now = new Date();
  const c = await Conversation.findOneAndUpdate(
    { _id: id, user: userId, $or: [{ generatingSince: null }, { generatingSince: { $lt: new Date(now - 3 * 60 * 1000) } }] },
    { $set: { generatingSince: now } },
    { returnDocument: 'after', timestamps: false }
  );
  if (!c) {
    if (!(await Conversation.exists({ _id: id, user: userId }))) throw ApiError.notFound('Conversation not found');
    throw ApiError.conflict('A response is already being generated in this conversation.', 'GENERATION_IN_PROGRESS');
  }
  return c;
}

export function releaseLock(id) {
  return Conversation.updateOne({ _id: id }, { $set: { generatingSince: null } }, { timestamps: false });
}

export const oid = (v) => new mongoose.Types.ObjectId(String(v));

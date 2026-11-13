import mongoose from 'mongoose';
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import ApiError from '../../utils/ApiError.js';
import Resource from '../../models/Resource.js';
import { markdownToDoc } from '../../processing/markdownToDoc.js';
import { createNote } from '../library/library.service.js';
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
    savedResourceId: m.savedResourceId ? String(m.savedResourceId) : null,
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

/**
 * Saves an assistant answer as a note: the Markdown becomes rich text, cited sources are
 * listed with links to the original items, and repeated saves return the same note.
 */
export async function saveAnswerAsNote(userId, conversationId, messageId, { title, collectionId, tags } = {}) {
  const conversation = await findOwnedConversation(userId, conversationId);
  const message = await Message.findOne({ _id: messageId, conversation: conversation._id, user: userId });
  if (!message || message.role !== 'assistant') throw ApiError.notFound('Answer not found');
  if (message.kind === 'notice' || !message.content.trim() || !['complete', 'stopped'].includes(message.status)) {
    throw ApiError.badRequest('Only completed answers can be saved');
  }
  if (message.savedResourceId && (await Resource.exists({ _id: message.savedResourceId, user: userId }))) {
    const existing = await Resource.findById(message.savedResourceId, { title: 1 }).lean();
    return { resource: { id: String(existing._id), title: existing.title }, created: false };
  }

  const question = await Message.findOne({ conversation: conversation._id, role: 'user', createdAt: { $lte: message.createdAt } })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const cited = (message.citations || []).filter((c) => c.cited && !c.resourceDeleted);
  let markdown = message.content;
  if (question) markdown = `> ${question.content.replace(/\n/g, '\n> ')}\n\n${markdown}`;
  if (cited.length) {
    markdown += `\n\n## Sources\n\n${cited
      .map((c) => `${c.n}. [${c.title.replace(/[[\]]/g, '')}](/vault/${c.resourceId})${c.page ? ` (page ${c.page})` : ''}`)
      .join('\n')}`;
  }
  const defaultTitle = conversation.title && conversation.title !== 'New conversation' ? conversation.title : (question?.content || 'Saved answer');
  const note = await createNote(userId, {
    title: (title || defaultTitle).replace(/\s+/g, ' ').trim().slice(0, 300),
    content: markdownToDoc(markdown),
    collectionId,
    tags: tags?.length ? tags : ['from assistant'],
  });
  message.savedResourceId = note.id;
  await message.save();
  return { resource: { id: note.id, title: note.title }, created: true };
}

import User from '../../models/User.js';
import Resource from '../../models/Resource.js';
import Chunk from '../../models/Chunk.js';
import Collection from '../../models/Collection.js';
import Tag from '../../models/Tag.js';
import Flashcard from '../../models/Flashcard.js';
import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import Connection from '../../models/Connection.js';
import Session from '../../models/Session.js';
import ApiError from '../../utils/ApiError.js';
import { hashPassword, revokeAllSessions, verifyPassword } from '../auth/auth.service.js';
import { deleteAllForUser } from '../library/library.service.js';
import { deleteAllForUser as deleteChatsForUser } from '../chat/chat.service.js';

/** Flattens a nested partial object into Mongo dot-paths: {ai:{x:1}} -> {'preferences.ai.x': 1} */
function toDotPaths(obj, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = `${prefix}.${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, toDotPaths(v, path));
    else if (v !== undefined) out[path] = v;
  }
  return out;
}

export async function updateProfile(userId, patch) {
  const user = await User.findByIdAndUpdate(userId, { $set: patch }, { returnDocument: 'after', runValidators: true });
  if (!user) throw ApiError.notFound('Account not found');
  return user;
}

export async function updatePreferences(userId, patch) {
  const $set = toDotPaths(patch, 'preferences');
  if (Object.keys($set).length === 0) throw ApiError.badRequest('Nothing to update');
  const user = await User.findByIdAndUpdate(userId, { $set }, { returnDocument: 'after', runValidators: true });
  if (!user) throw ApiError.notFound('Account not found');
  return user;
}

export async function completeOnboarding(userId, { name, theme, interests, defaultMode }) {
  const $set = {
    'preferences.theme': theme,
    'preferences.ai.defaultMode': defaultMode,
    interests,
    onboardingCompleted: true,
  };
  if (name) $set.name = name;
  const user = await User.findByIdAndUpdate(userId, { $set }, { returnDocument: 'after', runValidators: true });
  if (!user) throw ApiError.notFound('Account not found');
  return user;
}

export async function changePassword(userId, sessionId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', { fields: { currentPassword: 'Current password is incorrect' } });
  }
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  // Keep this device signed in; sign out everywhere else.
  const revoked = await revokeAllSessions(userId, { exceptSessionId: sessionId });
  return { user, revokedSessions: revoked };
}

export async function listSessions(userId, currentSessionId) {
  const sessions = await Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
  return sessions.map((s) => ({
    id: s._id.toString(),
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    current: s._id.toString() === currentSessionId,
  }));
}

export async function revokeSession(userId, sessionId) {
  // Ownership check is part of the filter: a user can only revoke their own sessions.
  const res = await Session.updateOne({ _id: sessionId, user: userId, revokedAt: null }, { revokedAt: new Date() });
  if (res.matchedCount === 0) throw ApiError.notFound('Session not found');
}

export async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.badRequest('Password is incorrect', { fields: { password: 'Password is incorrect' } });
  }
  // Remove all owned data and stored files. Conversations and messages are removed too.
  await deleteAllForUser(userId);
  await deleteChatsForUser(userId);
  await Session.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
}

/**
 * Everything the user owns, as one JSON document (notes as rich-text JSON, extracted text,
 * collections, tags, flashcards, conversations). Embedding vectors and password data are
 * excluded; uploaded files are listed by name but not inlined.
 */
export async function exportData(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('Account not found');
  const [resources, chunks, collections, tags, cards, conversations, messages, connections] = await Promise.all([
    Resource.find({ user: userId }).lean(),
    Chunk.find({ user: userId }, { resource: 1, index: 1, page: 1, heading: 1, text: 1 }).sort({ resource: 1, index: 1 }).lean(),
    Collection.find({ user: userId }).lean(),
    Tag.find({ user: userId }).lean(),
    Flashcard.find({ user: userId }).lean(),
    Conversation.find({ user: userId }).lean(),
    Message.find({ user: userId }).sort({ createdAt: 1 }).lean(),
    Connection.find({ user: userId, status: 'accepted' }).lean(),
  ]);
  const tagName = new Map(tags.map((t) => [String(t._id), t.name]));
  const textBy = new Map();
  for (const c of chunks) {
    if (!textBy.has(String(c.resource))) textBy.set(String(c.resource), []);
    textBy.get(String(c.resource)).push(c.text);
  }
  return {
    exportedAt: new Date().toISOString(),
    format: 'mindmesh-export-v1',
    profile: { name: user.name, email: user.email, bio: user.bio, interests: user.interests, preferences: user.preferences, createdAt: user.createdAt },
    collections: collections.map((c) => ({ id: String(c._id), name: c.name, description: c.description, parentId: c.parent ? String(c.parent) : null })),
    tags: tags.map((t) => t.name),
    resources: resources.map((r) => ({
      id: String(r._id),
      type: r.type,
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      pinned: r.pinned,
      collectionId: r.collectionId ? String(r.collectionId) : null,
      tags: (r.tags || []).map((t) => tagName.get(String(t))).filter(Boolean),
      ...(r.type === 'note' ? { content: r.note?.content } : {}),
      ...(r.type === 'document' ? { file: { name: r.file?.originalName, size: r.file?.size } } : {}),
      ...(r.type === 'link' ? { url: r.link?.url, description: r.link?.description } : {}),
      extractedText: (textBy.get(String(r._id)) || []).join('\n\n'),
    })),
    connections: connections.map((c) => ({ a: String(c.a), b: String(c.b), label: c.label, kind: c.kind })),
    flashcards: cards.map((c) => ({ front: c.front, back: c.back, resourceId: c.resource ? String(c.resource) : null, reviewCount: c.reviewCount, dueAt: c.dueAt })),
    conversations: conversations.map((c) => ({
      id: String(c._id),
      title: c.title,
      createdAt: c.createdAt,
      messages: messages
        .filter((m) => String(m.conversation) === String(c._id))
        .map((m) => ({ role: m.role, mode: m.mode, content: m.content, at: m.createdAt, sources: (m.citations || []).filter((x) => x.cited).map((x) => ({ title: x.title, page: x.page })) })),
    })),
  };
}

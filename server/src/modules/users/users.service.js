import User from '../../models/User.js';
import Session from '../../models/Session.js';
import ApiError from '../../utils/ApiError.js';
import { hashPassword, revokeAllSessions, verifyPassword } from '../auth/auth.service.js';

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
  // Later phases register their own cleanup here (notes, documents, chunks, conversations...).
  await Session.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
}

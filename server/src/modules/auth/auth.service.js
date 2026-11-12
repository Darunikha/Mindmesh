import bcrypt from 'bcryptjs';
import env from '../../config/env.js';
import User from '../../models/User.js';
import Session from '../../models/Session.js';
import ApiError from '../../utils/ApiError.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PREVIOUS_HASHES = 20;

// A real hash so timing for unknown emails matches timing for wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('mindmesh-timing-equaliser', 10);

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function createSession(userId, meta) {
  const refreshToken = generateRefreshToken();
  const session = await Session.create({
    user: userId,
    tokenHash: hashToken(refreshToken),
    userAgent: (meta.userAgent || '').slice(0, 400),
    ip: (meta.ip || '').slice(0, 64),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  });
  const accessToken = signAccessToken({ userId, sessionId: session._id });
  return { session, accessToken, refreshToken };
}

export async function register({ name, email, password, theme }, meta) {
  const existing = await User.exists({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    lastLoginAt: new Date(),
    ...(theme ? { preferences: { theme } } : {}),
  });
  const tokens = await createSession(user._id, meta);
  return { user, ...tokens };
}

export async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');

  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await createSession(user._id, meta);
  return { user, ...tokens };
}

/**
 * Rotates a refresh token. If a token that was already rotated is presented again,
 * someone is replaying a stolen token, so every session for that user is revoked.
 */
export async function refresh(refreshToken, meta) {
  if (!refreshToken) throw ApiError.unauthorized('No active session', 'NO_SESSION');
  const hash = hashToken(refreshToken);

  const session = await Session.findOne({ tokenHash: hash });
  if (!session) {
    const reused = await Session.findOne({ previousTokenHashes: hash });
    if (reused) {
      await Session.updateMany({ user: reused.user, revokedAt: null }, { revokedAt: new Date() });
      throw ApiError.unauthorized('Session was invalidated for your security. Please sign in again.', 'TOKEN_REUSE');
    }
    throw ApiError.unauthorized('No active session', 'NO_SESSION');
  }
  if (!session.isActive()) throw ApiError.unauthorized('Session has ended', 'SESSION_REVOKED');

  const user = await User.findById(session.user);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'USER_NOT_FOUND');

  const nextToken = generateRefreshToken();
  const nextHash = hashToken(nextToken);
  // Atomic compare-and-swap so two concurrent refreshes cannot both succeed.
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, tokenHash: hash },
    {
      $set: {
        tokenHash: nextHash,
        lastUsedAt: new Date(),
        userAgent: (meta.userAgent || session.userAgent).slice(0, 400),
        ip: (meta.ip || session.ip).slice(0, 64),
      },
      $push: { previousTokenHashes: { $each: [hash], $slice: -MAX_PREVIOUS_HASHES } },
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.unauthorized('Session was refreshed elsewhere. Please retry.', 'REFRESH_RACE');

  return { user, accessToken: signAccessToken({ userId: user._id, sessionId: session._id }), refreshToken: nextToken };
}

export async function logout(refreshToken) {
  if (!refreshToken) return;
  await Session.updateOne({ tokenHash: hashToken(refreshToken), revokedAt: null }, { revokedAt: new Date() });
}

export async function revokeAllSessions(userId, { exceptSessionId } = {}) {
  const filter = { user: userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const res = await Session.updateMany(filter, { revokedAt: new Date() });
  return res.modifiedCount;
}

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const JWT_OPTS = { issuer: 'mindmesh', audience: 'mindmesh-app' };
const ALGORITHM = 'HS256';

export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTS,
    subject: String(userId),
    expiresIn: env.ACCESS_TOKEN_TTL,
    algorithm: ALGORITHM,
  });
}

export function verifyAccessToken(token) {
  // Pin the algorithm so tokens signed any other way (including "none") are rejected.
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { ...JWT_OPTS, algorithms: [ALGORITHM] });
}

/** Refresh tokens are opaque random strings; only their HMAC is ever persisted. */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

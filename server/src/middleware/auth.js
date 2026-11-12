import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import Session from '../models/Session.js';
import User from '../models/User.js';

/**
 * Verifies the Bearer access token, then confirms the backing session is still
 * active so that "log out everywhere" and session revocation take effect immediately.
 * Attaches req.user (the User document) and req.sessionId.
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }

  const [session, user] = await Promise.all([
    Session.findOne({ _id: payload.sid, user: payload.sub }),
    User.findById(payload.sub),
  ]);

  if (!session || !session.isActive()) throw ApiError.unauthorized('Session has ended', 'SESSION_REVOKED');
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'USER_NOT_FOUND');

  req.user = user;
  req.sessionId = session._id.toString();
  next();
}

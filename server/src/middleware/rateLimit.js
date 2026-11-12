import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

const handler = (_req, res, _next, options) =>
  res.status(options.statusCode).json({
    error: { message: 'Too many attempts. Please wait a moment and try again.', code: 'RATE_LIMITED' },
  });

const skip = () => env.NODE_ENV === 'test';

/** Login / register: protects against credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
});

/** Sensitive account actions (password change, account deletion). */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
});

/** General API ceiling per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
});

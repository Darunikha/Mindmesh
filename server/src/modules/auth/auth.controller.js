import env, { isProd } from '../../config/env.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'mm_rt';

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});

const meta = (req) => ({ userAgent: req.get('user-agent') || '', ip: req.ip || '' });

function sendSession(res, status, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  res.status(status).json({ user: user.toPublic(), accessToken });
}

export async function register(req, res) {
  sendSession(res, 201, await authService.register(req.body, meta(req)));
}

export async function login(req, res) {
  sendSession(res, 200, await authService.login(req.body, meta(req)));
}

export async function refresh(req, res) {
  try {
    sendSession(res, 200, await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
}

export async function logoutAll(req, res) {
  await authService.revokeAllSessions(req.user._id);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
}

import crypto from 'node:crypto';
import env from '../../config/env.js';
import User from '../../models/User.js';
import PasswordReset from '../../models/PasswordReset.js';
import ApiError from '../../utils/ApiError.js';
import { hashToken } from '../../utils/tokens.js';
import { inBackground, sendMail } from '../../mail/mailer.js';
import { passwordChangedEmail, passwordResetEmail } from '../../mail/templates.js';
import { hashPassword, revokeAllSessions } from './auth.service.js';

/** At most one reset email per account in this period, however many times it is asked for. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** The link is built from configuration only, never from request headers an attacker could forge. */
export function resetLink(token) {
  const base = (env.APP_URL || env.CLIENT_ORIGIN.split(',')[0]).trim().replace(/\/+$/, '');
  // The token sits after "#", which browsers do not send to servers, so it stays out of access logs.
  return `${base}/reset-password#token=${token}`;
}

export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = Date.now();
  try {
    // Replaces an older link. A recent one doesn't match the filter, so the insert hits the
    // unique index on `user`, which makes the cooldown safe against simultaneous requests.
    await PasswordReset.updateOne(
      { user: user._id, sentAt: { $lte: new Date(now - RESEND_COOLDOWN_MS) } },
      { $set: { tokenHash, sentAt: new Date(now), expiresAt: new Date(now + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000) } },
      { upsert: true }
    );
  } catch (err) {
    if (err.code === 11000) return;
    throw err;
  }

  try {
    await sendMail({ to: user.email, ...passwordResetEmail({ link: resetLink(token), minutes: env.PASSWORD_RESET_TTL_MINUTES }) });
  } catch (err) {
    // Nothing arrived, so don't make the person wait out the cooldown before trying again.
    await PasswordReset.deleteOne({ tokenHash });
    throw err;
  }
}

const invalidLink = () => new ApiError(400, 'This reset link has expired or has already been used. Request a new one.', 'RESET_LINK_INVALID');

export async function resetPassword({ token, password }) {
  // Finding and deleting in one step means a link can only ever be used once.
  const record = await PasswordReset.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!record) throw invalidLink();
  const user = await User.findById(record.user);
  if (!user) throw invalidLink();

  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  await user.save();
  // Whoever knew the old password is signed out everywhere.
  await revokeAllSessions(user._id);
  inBackground('password change notice', () => sendMail({ to: user.email, ...passwordChangedEmail() }));
}

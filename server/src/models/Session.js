import mongoose from 'mongoose';

/**
 * A login session backed by a rotating refresh token.
 * Each refresh replaces tokenHash. Presenting a previously rotated token is treated
 * as token theft and revokes every session belonging to that user.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    previousTokenHashes: { type: [String], default: [], select: false },
    userAgent: { type: String, maxlength: 400, default: '' },
    ip: { type: String, maxlength: 64, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// MongoDB deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ previousTokenHashes: 1 });

sessionSchema.methods.isActive = function isActive() {
  return !this.revokedAt && this.expiresAt > new Date();
};

export default mongoose.model('Session', sessionSchema);

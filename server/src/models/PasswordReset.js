import mongoose from 'mongoose';

/**
 * An outstanding "forgot password" link. There is at most one per user, and only the hash of
 * its token is stored, so reading the database does not give anyone a usable link.
 */
const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tokenHash: { type: String, required: true, unique: true },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB deletes expired links automatically.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordReset', passwordResetSchema);

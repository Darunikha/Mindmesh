import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * An undirected relationship between two of a user's resources.
 * - kind 'manual': created by the user.
 * - kind 'ai': proposed by the suggestion engine; it only appears in the graph once accepted.
 * Dismissed and removed suggestions are kept so the same pair is never proposed again.
 */
const connectionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    /** Endpoints are stored in sorted order so each pair has exactly one record. */
    a: { type: ObjectId, ref: 'Resource', required: true },
    b: { type: ObjectId, ref: 'Resource', required: true },
    kind: { type: String, enum: ['manual', 'ai'], required: true },
    status: { type: String, enum: ['accepted', 'suggested', 'dismissed', 'removed'], required: true },
    label: { type: String, trim: true, maxlength: 60, default: '' },
    reason: { type: String, maxlength: 300, default: '' },
    score: { type: Number, default: null },
    method: { type: String, default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

connectionSchema.index({ user: 1, a: 1, b: 1 }, { unique: true });
connectionSchema.index({ user: 1, status: 1 });
connectionSchema.index({ a: 1 });
connectionSchema.index({ b: 1 });

export const orderPair = (x, y) => (String(x) < String(y) ? [x, y] : [y, x]);

export default mongoose.model('Connection', connectionSchema);

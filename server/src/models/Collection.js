import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const COLLECTION_COLORS = ['accent', 'accent-2', 'accent-3', 'ink'];
export const MAX_COLLECTION_DEPTH = 3;

const collectionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameLower: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 280, default: '' },
    parent: { type: ObjectId, ref: 'Collection', default: null },
    color: { type: String, enum: COLLECTION_COLORS, default: 'accent' },
  },
  { timestamps: true }
);

// Sibling names must be unique per user (case-insensitive).
collectionSchema.index({ user: 1, parent: 1, nameLower: 1 }, { unique: true });

export default mongoose.model('Collection', collectionSchema);

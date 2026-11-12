import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const TAG_COLORS = ['accent', 'accent-2', 'accent-3', 'ink'];

const tagSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    nameLower: { type: String, required: true },
    color: { type: String, enum: TAG_COLORS, default: 'accent' },
  },
  { timestamps: true }
);

tagSchema.index({ user: 1, nameLower: 1 }, { unique: true });

export default mongoose.model('Tag', tagSchema);

import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
export const CHAT_MODES = ['general', 'knowledge'];

const conversationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 120, default: 'New conversation' },
    /** True once the user renamed it; automatic titles never overwrite a user's title. */
    titleLocked: { type: Boolean, default: false },
    /** Mode of the most recent message; new messages default to it. */
    mode: { type: String, enum: CHAT_MODES, default: 'general' },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    /** Rolling summary of messages that no longer fit in the model's context window. */
    summary: { type: String, default: '' },
    summaryThrough: { type: Date, default: null },
    /** Generation lock: prevents two answers being generated in one conversation at once. */
    generatingSince: { type: Date, default: null },
  },
  { timestamps: true }
);

conversationSchema.index({ user: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);

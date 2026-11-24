import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
/**
 * general: the model's own knowledge. knowledge ("My Knowledge"): grounded in the user's library.
 * hybrid ("Both"): the library when it is relevant, general knowledge when it is not.
 */
export const CHAT_MODES = ['general', 'knowledge', 'hybrid'];

const conversationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 120, default: 'New conversation' },
    /** True once the user renamed it; automatic titles never overwrite a user's title. */
    titleLocked: { type: Boolean, default: false },
    /** Pinned conversations are listed first. */
    pinned: { type: Boolean, default: false },
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
conversationSchema.index({ user: 1, pinned: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);

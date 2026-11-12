import mongoose from 'mongoose';
import { CHAT_MODES } from './Conversation.js';

const { ObjectId } = mongoose.Schema.Types;

/** A source passage given to the model. `cited` marks the ones the answer actually referenced. */
const citationSchema = new mongoose.Schema(
  {
    n: { type: Number, required: true },
    chunkId: { type: ObjectId, ref: 'Chunk', required: true },
    resourceId: { type: ObjectId, ref: 'Resource', required: true },
    resourceType: { type: String, required: true },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    page: { type: Number, default: null },
    pageEnd: { type: Number, default: null },
    heading: { type: String, default: null },
    similarity: { type: Number, default: null },
    matchedBy: { type: [String], default: [] },
    cited: { type: Boolean, default: false },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: 'Conversation', required: true },
    user: { type: ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    /** 'notice' messages are written by Mindmesh itself (e.g. "your library is empty"), never by the model. */
    kind: { type: String, enum: ['message', 'notice'], default: 'message' },
    mode: { type: String, enum: CHAT_MODES, required: true },
    content: { type: String, default: '' },
    status: { type: String, enum: ['streaming', 'complete', 'stopped', 'error', 'refused'], default: 'complete' },
    error: { type: String, default: null },
    errorCode: { type: String, default: null },
    /** Client-generated id that makes "send" idempotent (double-clicks, retries). */
    clientRequestId: { type: String, default: null },
    citations: { type: [citationSchema], default: [] },
    retrieval: {
      strategy: { type: String, default: null },
      searched: { type: Boolean, default: false },
      found: { type: Number, default: 0 },
      note: { type: String, default: null },
    },
    followUps: { type: [String], default: [] },
    truncated: { type: Boolean, default: false },
    model: { type: String, default: null },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ user: 1, conversation: 1 });
messageSchema.index({ conversation: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });

export default mongoose.model('Message', messageSchema);

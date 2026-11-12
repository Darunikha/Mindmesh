import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const ACTIVITY_TYPES = [
  'note_created',
  'document_uploaded',
  'link_saved',
  'collection_created',
  'connection_created',
  'search',
  'conversation_started',
  'resource_opened',
];

/** Append-only log behind the Knowledge Timeline. */
const activitySchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    /** Primary subject, when there is one (a resource, collection or conversation). */
    resource: { type: ObjectId, ref: 'Resource', default: null },
    collectionRef: { type: ObjectId, ref: 'Collection', default: null },
    conversation: { type: ObjectId, ref: 'Conversation', default: null },
    title: { type: String, maxlength: 300, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

activitySchema.index({ user: 1, at: -1 });
activitySchema.index({ user: 1, type: 1, at: -1 });

export default mongoose.model('Activity', activitySchema);

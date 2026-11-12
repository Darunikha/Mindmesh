import mongoose from 'mongoose';

export const RESOURCE_TYPES = ['note', 'document', 'link'];
export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'];

const { ObjectId } = mongoose.Schema.Types;

/**
 * One model for every item in the knowledge library: notes, uploaded documents and saved links.
 * Shared concerns (ownership, pinning, collections, tags, recents, search, processing) live here once;
 * type-specific data lives in the `note`, `file` and `link` sub-documents.
 * Extracted text is stored as Chunk documents rather than on the resource itself.
 */
const resourceSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    /** Short plain-text preview for cards and search results. */
    excerpt: { type: String, default: '', maxlength: 600 },
    pinned: { type: Boolean, default: false },
    collectionId: { type: ObjectId, ref: 'Collection', default: null },
    tags: { type: [{ type: ObjectId, ref: 'Tag' }], default: [] },
    lastAccessedAt: { type: Date, default: null },

    note: {
      /** TipTap/ProseMirror JSON document. */
      content: { type: mongoose.Schema.Types.Mixed, default: null },
      wordCount: { type: Number, default: 0 },
      /** Incremented on every content save; used to detect conflicting edits from two tabs. */
      revision: { type: Number, default: 0 },
    },

    file: {
      storageKey: { type: String },
      originalName: { type: String, maxlength: 300 },
      mimeType: { type: String },
      extension: { type: String },
      size: { type: Number },
      pageCount: { type: Number, default: null },
    },

    link: {
      url: { type: String, maxlength: 2048 },
      finalUrl: { type: String, maxlength: 2048 },
      domain: { type: String, maxlength: 255 },
      description: { type: String, maxlength: 1000, default: '' },
      siteName: { type: String, maxlength: 200, default: '' },
      faviconUrl: { type: String, maxlength: 2048, default: '' },
      imageUrl: { type: String, maxlength: 2048, default: '' },
      /** True when the user set the title; fetched page titles never overwrite it. */
      customTitle: { type: Boolean, default: false },
    },

    processing: {
      status: { type: String, enum: PROCESSING_STATUSES, default: 'ready' },
      error: { type: String, default: null },
      /** Machine-readable reason for failures, e.g. NO_TEXT, FETCH_BLOCKED. */
      code: { type: String, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      chunkCount: { type: Number, default: 0 },
      charCount: { type: Number, default: 0 },
      /** Informational note, e.g. when a very long item was only partly indexed. */
      note: { type: String, default: null },
    },

    /** Semantic index state (Phase 3). 'disabled' means no embedding provider is configured. */
    embedding: {
      status: { type: String, enum: ['none', 'pending', 'processing', 'ready', 'failed', 'disabled'], default: 'none' },
      model: { type: String, default: null },
      error: { type: String, default: null },
      embeddedChunks: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Listing patterns: every query is scoped by user first.
resourceSchema.index({ user: 1, updatedAt: -1 });
resourceSchema.index({ user: 1, createdAt: -1 });
resourceSchema.index({ user: 1, lastAccessedAt: -1 });
resourceSchema.index({ user: 1, type: 1, updatedAt: -1 });
resourceSchema.index({ user: 1, collectionId: 1, updatedAt: -1 });
resourceSchema.index({ user: 1, tags: 1 });
resourceSchema.index({ user: 1, pinned: 1, updatedAt: -1 });
resourceSchema.index({ 'processing.status': 1 });
resourceSchema.index({ 'embedding.status': 1 });
resourceSchema.index(
  { title: 'text', excerpt: 'text', 'link.description': 'text', 'link.domain': 'text' },
  { weights: { title: 10, 'link.domain': 4, 'link.description': 3, excerpt: 2 }, name: 'resource_text' }
);

export default mongoose.model('Resource', resourceSchema);

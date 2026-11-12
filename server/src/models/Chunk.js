import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A passage of extracted text from a resource. Chunks power full-text search now,
 * and in Phase 3 they gain an `embedding` vector for semantic search and RAG.
 * `user` is denormalised so every retrieval query can be filtered by owner directly.
 */
const chunkSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    resource: { type: ObjectId, ref: 'Resource', required: true },
    resourceType: { type: String, required: true },
    index: { type: Number, required: true },
    text: { type: String, required: true },
    /** 1-based page number where the chunk starts (PDFs only). */
    page: { type: Number, default: null },
    pageEnd: { type: Number, default: null },
    /** Nearest preceding heading, when the source has structure (notes, markdown). */
    heading: { type: String, default: null, maxlength: 300 },
    charCount: { type: Number, required: true },
    tokenEstimate: { type: Number, required: true },
  },
  { timestamps: true }
);

chunkSchema.index({ resource: 1, index: 1 }, { unique: true });
chunkSchema.index({ user: 1, resource: 1 });
chunkSchema.index({ text: 'text', heading: 'text' }, { weights: { heading: 3, text: 1 }, name: 'chunk_text' });

export default mongoose.model('Chunk', chunkSchema);

import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A question/answer card scheduled with spaced repetition (SM-2 style).
 * `resource` links a card to the note or document it was made from; if that item is deleted
 * the card is kept (it is still knowledge) and simply loses its source link.
 */
const flashcardSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    front: { type: String, required: true, trim: true, maxlength: 1000 },
    back: { type: String, required: true, trim: true, maxlength: 4000 },
    resource: { type: ObjectId, ref: 'Resource', default: null },
    origin: { type: String, enum: ['manual', 'ai'], default: 'manual' },
    suspended: { type: Boolean, default: false },

    // Scheduling state
    ease: { type: Number, default: 2.5 },
    intervalDays: { type: Number, default: 0 },
    repetitions: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    dueAt: { type: Date, default: Date.now },
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

flashcardSchema.index({ user: 1, suspended: 1, dueAt: 1 });
flashcardSchema.index({ user: 1, resource: 1 });
flashcardSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Flashcard', flashcardSchema);

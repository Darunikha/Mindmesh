import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * One flashcard review. Used for "reviewed today" and the daily streak, which need to know
 * on which days a review happened (a card only remembers its latest review).
 * Events expire after 400 days, which is more than any streak the app displays.
 */
const reviewEventSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  card: { type: ObjectId, ref: 'Flashcard', default: null },
  grade: { type: String, enum: ['again', 'hard', 'good', 'easy'], required: true },
  at: { type: Date, default: Date.now },
});

reviewEventSchema.index({ user: 1, at: -1 });
reviewEventSchema.index({ at: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.model('ReviewEvent', reviewEventSchema);

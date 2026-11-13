import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, maxlength: 1000 },
    /** Model-written reference answer. Never sent to the client before the question is answered. */
    reference: { type: String, required: true, maxlength: 2000 },
    sourceResource: { type: ObjectId, ref: 'Resource', default: null },
    sourceTitle: { type: String, default: '' },
    sourcePage: { type: Number, default: null },
    sourceExcerpt: { type: String, default: '', maxlength: 800 },
    userAnswer: { type: String, default: null, maxlength: 2000 },
    verdict: { type: String, enum: ['correct', 'partial', 'incorrect', null], default: null },
    feedback: { type: String, default: '', maxlength: 1000 },
    answeredAt: { type: Date, default: null },
  },
  { _id: false }
);

/** A self-test generated from the user's own content, graded question by question. */
const quizSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'Quiz', maxlength: 200 },
    scope: {
      type: { type: String, enum: ['all', 'collection', 'resource'], required: true },
      id: { type: ObjectId, default: null },
    },
    questions: { type: [questionSchema], default: [] },
    status: { type: String, enum: ['active', 'complete'], default: 'active' },
    /** 0–100, set when every question is answered (correct = 1, partial = 0.5). */
    score: { type: Number, default: null },
    flashcardsMadeAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Quiz', quizSchema);

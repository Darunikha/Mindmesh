import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** A user's recent searches. One record per distinct query; repeats move it to the top. */
const searchHistorySchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    query: { type: String, required: true, maxlength: 200 },
    queryLower: { type: String, required: true },
    resultCount: { type: Number, default: 0 },
    count: { type: Number, default: 1 },
    lastSearchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

searchHistorySchema.index({ user: 1, queryLower: 1 }, { unique: true });
searchHistorySchema.index({ user: 1, lastSearchedAt: -1 });

export default mongoose.model('SearchHistory', searchHistorySchema);

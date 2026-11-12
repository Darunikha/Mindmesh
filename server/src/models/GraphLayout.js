import mongoose from 'mongoose';

/** Node positions a user has arranged by dragging, keyed by graph node id (e.g. "r:<id>"). */
const graphLayoutSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    positions: { type: Map, of: new mongoose.Schema({ x: Number, y: Number }, { _id: false }), default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('GraphLayout', graphLayoutSchema);

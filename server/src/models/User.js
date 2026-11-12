import mongoose from 'mongoose';

export const THEMES = ['library', 'studio', 'lab'];
export const ANSWER_MODES = ['general', 'knowledge', 'hybrid'];
export const RESPONSE_STYLES = ['concise', 'balanced', 'detailed'];
export const LIBRARY_SORTS = ['updated', 'created', 'title'];
export const LIBRARY_VIEWS = ['grid', 'list'];

const preferencesSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: THEMES, default: 'library' },
    reduceMotion: { type: Boolean, default: false },
    ai: {
      defaultMode: { type: String, enum: ANSWER_MODES, default: 'general' },
      responseStyle: { type: String, enum: RESPONSE_STYLES, default: 'balanced' },
      showFollowUps: { type: Boolean, default: true },
    },
    library: {
      defaultSort: { type: String, enum: LIBRARY_SORTS, default: 'updated' },
      defaultView: { type: String, enum: LIBRARY_VIEWS, default: 'grid' },
      autoProcessUploads: { type: Boolean, default: true },
      suggestConnections: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, trim: true, maxlength: 280, default: '' },
    interests: { type: [String], default: [] },
    preferences: { type: preferencesSchema, default: () => ({}) },
    onboardingCompleted: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    bio: this.bio,
    interests: this.interests,
    preferences: this.preferences?.toObject ? this.preferences.toObject() : this.preferences,
    onboardingCompleted: this.onboardingCompleted,
    passwordChangedAt: this.passwordChangedAt ?? null,
    lastLoginAt: this.lastLoginAt ?? null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);

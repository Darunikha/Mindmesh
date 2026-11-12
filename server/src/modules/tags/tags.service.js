import mongoose from 'mongoose';
import Tag from '../../models/Tag.js';
import Resource from '../../models/Resource.js';
import GraphLayout from '../../models/GraphLayout.js';
import ApiError from '../../utils/ApiError.js';

export const serializeTag = (t) => ({ id: t._id.toString(), name: t.name, color: t.color });

const normalise = (name) => String(name).trim().replace(/\s+/g, ' ').slice(0, 40);

export async function listTags(userId) {
  const [tags, counts] = await Promise.all([
    Tag.find({ user: userId }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).lean(),
    Resource.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return tags.map((t) => ({ ...serializeTag(t), count: byId.get(String(t._id)) || 0 }));
}

export async function createTag(userId, { name, color }) {
  const clean = normalise(name);
  if (await Tag.exists({ user: userId, nameLower: clean.toLowerCase() })) throw ApiError.conflict(`A tag named "${clean}" already exists`, 'TAG_EXISTS');
  const tag = await Tag.create({ user: userId, name: clean, nameLower: clean.toLowerCase(), ...(color ? { color } : {}) });
  return { ...serializeTag(tag), count: 0 };
}

export async function updateTag(userId, id, { name, color }) {
  const tag = await Tag.findOne({ _id: id, user: userId });
  if (!tag) throw ApiError.notFound('Tag not found');
  if (name !== undefined) {
    const clean = normalise(name);
    const clash = await Tag.findOne({ user: userId, nameLower: clean.toLowerCase(), _id: { $ne: tag._id } });
    if (clash) throw ApiError.conflict(`A tag named "${clean}" already exists`, 'TAG_EXISTS');
    tag.name = clean;
    tag.nameLower = clean.toLowerCase();
  }
  if (color) tag.color = color;
  await tag.save();
  return serializeTag(tag);
}

/** Deleting a tag only detaches it from resources; the resources are untouched. */
export async function deleteTag(userId, id) {
  const tag = await Tag.findOneAndDelete({ _id: id, user: userId });
  if (!tag) throw ApiError.notFound('Tag not found');
  const res = await Resource.updateMany({ user: userId, tags: tag._id }, { $pull: { tags: tag._id } }, { timestamps: false });
  await GraphLayout.updateOne({ user: userId }, { $unset: { [`positions.t:${tag._id}`]: 1 } });
  return { detachedFrom: res.modifiedCount };
}

/** Resolves tag names to ids for a user, creating missing tags. Race-safe via the unique index. */
export async function resolveTagNames(userId, names = []) {
  const unique = [...new Map(names.map(normalise).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
  const ids = [];
  for (const name of unique) {
    try {
      const tag = await Tag.findOneAndUpdate(
        { user: userId, nameLower: name.toLowerCase() },
        { $setOnInsert: { user: userId, name, nameLower: name.toLowerCase() } },
        { upsert: true, returnDocument: 'after' }
      );
      ids.push(tag._id);
    } catch (err) {
      if (err?.code !== 11000) throw err;
      ids.push((await Tag.findOne({ user: userId, nameLower: name.toLowerCase() }))._id);
    }
  }
  return ids;
}

/** Verifies every tag id belongs to the user. */
export async function assertTagsOwned(userId, ids) {
  if (!ids.length) return;
  const count = await Tag.countDocuments({ user: userId, _id: { $in: ids } });
  if (count !== new Set(ids.map(String)).size) throw ApiError.badRequest('One or more tags were not found');
}

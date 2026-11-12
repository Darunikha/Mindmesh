import mongoose from 'mongoose';
import Collection, { MAX_COLLECTION_DEPTH } from '../../models/Collection.js';
import Resource from '../../models/Resource.js';
import ApiError from '../../utils/ApiError.js';
import { logActivity } from '../timeline/activity.js';

export const serializeCollection = (c) => ({
  id: c._id.toString(),
  name: c.name,
  description: c.description,
  color: c.color,
  parentId: c.parent ? c.parent.toString() : null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export async function assertCollectionOwned(userId, id) {
  if (!id) return null;
  const c = await Collection.findOne({ _id: id, user: userId });
  if (!c) throw ApiError.badRequest('Collection not found', { fields: { collectionId: 'Collection not found' } });
  return c;
}

/** Flat list with direct resource counts; the client assembles the tree. */
export async function listCollections(userId) {
  const [collections, counts] = await Promise.all([
    Collection.find({ user: userId }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).lean(),
    Resource.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
      { $group: { _id: '$collectionId', count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return {
    collections: collections.map((c) => ({ ...serializeCollection(c), count: byId.get(String(c._id)) || 0 })),
    unfiledCount: byId.get('null') || 0,
  };
}

async function depthOf(userId, id) {
  let depth = 0;
  let cursor = id;
  const seen = new Set();
  while (cursor) {
    if (seen.has(String(cursor))) throw ApiError.badRequest('Collection hierarchy is corrupted');
    seen.add(String(cursor));
    depth += 1;
    const c = await Collection.findOne({ _id: cursor, user: userId }, { parent: 1 }).lean();
    cursor = c?.parent;
  }
  return depth;
}

async function descendantIds(userId, rootId) {
  const all = await Collection.find({ user: userId }, { parent: 1 }).lean();
  const children = new Map();
  for (const c of all) {
    const key = String(c.parent);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(String(c._id));
  }
  const out = [];
  const stack = [String(rootId)];
  while (stack.length) {
    const id = stack.pop();
    for (const child of children.get(id) || []) {
      out.push(child);
      stack.push(child);
    }
  }
  return out;
}

async function subtreeHeight(userId, rootId) {
  const all = await Collection.find({ user: userId }, { parent: 1 }).lean();
  const children = new Map();
  for (const c of all) {
    const key = String(c.parent);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(String(c._id));
  }
  const height = (id) => 1 + Math.max(0, ...(children.get(id) || []).map(height));
  return height(String(rootId));
}

async function assertUniqueName(userId, parent, name, exceptId) {
  const clash = await Collection.findOne({ user: userId, parent: parent || null, nameLower: name.toLowerCase(), ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw ApiError.conflict(`A collection named "${name}" already exists here`, 'COLLECTION_EXISTS');
}

export async function createCollection(userId, { name, description = '', color, parentId = null }) {
  if (parentId) {
    await assertCollectionOwned(userId, parentId);
    if ((await depthOf(userId, parentId)) >= MAX_COLLECTION_DEPTH) {
      throw ApiError.badRequest(`Collections can be nested up to ${MAX_COLLECTION_DEPTH} levels deep`);
    }
  }
  await assertUniqueName(userId, parentId, name);
  const c = await Collection.create({ user: userId, name, nameLower: name.toLowerCase(), description, parent: parentId, ...(color ? { color } : {}) });
  logActivity(userId, 'collection_created', { collectionRef: c._id, title: c.name });
  return { ...serializeCollection(c), count: 0 };
}

export async function updateCollection(userId, id, patch) {
  const c = await Collection.findOne({ _id: id, user: userId });
  if (!c) throw ApiError.notFound('Collection not found');

  if (patch.parentId !== undefined && String(patch.parentId) !== String(c.parent)) {
    const newParent = patch.parentId;
    if (newParent) {
      if (String(newParent) === String(c._id)) throw ApiError.badRequest('A collection cannot contain itself');
      await assertCollectionOwned(userId, newParent);
      if ((await descendantIds(userId, c._id)).includes(String(newParent))) {
        throw ApiError.badRequest('A collection cannot be moved inside one of its own sub-collections');
      }
      if ((await depthOf(userId, newParent)) + (await subtreeHeight(userId, c._id)) > MAX_COLLECTION_DEPTH) {
        throw ApiError.badRequest(`Collections can be nested up to ${MAX_COLLECTION_DEPTH} levels deep`);
      }
    }
    c.parent = newParent || null;
  }
  const name = patch.name ?? c.name;
  if (patch.name !== undefined || patch.parentId !== undefined) await assertUniqueName(userId, c.parent, name, c._id);
  if (patch.name !== undefined) {
    c.name = patch.name;
    c.nameLower = patch.name.toLowerCase();
  }
  if (patch.description !== undefined) c.description = patch.description;
  if (patch.color) c.color = patch.color;
  await c.save();
  return serializeCollection(c);
}

/**
 * Deletes a collection without deleting anything inside it:
 * its resources move to `moveTo` (or become unfiled), and its sub-collections move up one level.
 */
export async function deleteCollection(userId, id, { moveTo = null } = {}) {
  const c = await Collection.findOne({ _id: id, user: userId });
  if (!c) throw ApiError.notFound('Collection not found');
  if (moveTo) {
    if (String(moveTo) === String(c._id)) throw ApiError.badRequest('Choose a different collection to move items into');
    await assertCollectionOwned(userId, moveTo);
    if ((await descendantIds(userId, c._id)).includes(String(moveTo))) {
      throw ApiError.badRequest('Items cannot be moved into a sub-collection of the collection being deleted');
    }
  }

  // Sub-collections move up to the deleted collection's parent; rename on name clash.
  const children = await Collection.find({ user: userId, parent: c._id });
  for (const child of children) {
    child.parent = c.parent;
    let candidate = child.name;
    let n = 2;
    while (await Collection.exists({ user: userId, parent: c.parent, nameLower: candidate.toLowerCase(), _id: { $ne: child._id } })) {
      candidate = `${child.name} (${n++})`;
    }
    child.name = candidate;
    child.nameLower = candidate.toLowerCase();
    await child.save();
  }

  const moved = await Resource.updateMany({ user: userId, collectionId: c._id }, { $set: { collectionId: moveTo || null } }, { timestamps: false });
  await c.deleteOne();
  return { movedResources: moved.modifiedCount, movedCollections: children.length, movedTo: moveTo || null };
}

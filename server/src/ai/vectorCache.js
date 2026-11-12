import Chunk from '../models/Chunk.js';

/**
 * In-memory cache of each active user's passage vectors for in-process vector search and
 * similarity. Without it, every query re-read every embedding from MongoDB (~8 KB per
 * passage). Entries are invalidated whenever that user's chunks or embeddings change, and
 * the least-recently-used users are evicted. With Atlas Vector Search the cache is only
 * used for graph similarity.
 */
const MAX_USERS = 25;
const MAX_ROWS = 50000;
const cache = new Map(); // userId -> { model, rows: [{ id, resource, vec: Float32Array }] }
const loading = new Map();
const versions = new Map(); // bumps on every invalidation, so an in-flight load never caches stale rows

export function invalidateUserVectors(userId) {
  const key = String(userId);
  cache.delete(key);
  versions.set(key, (versions.get(key) || 0) + 1);
}

export async function getUserVectors(userId, model) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && hit.model === model) {
    cache.delete(key);
    cache.set(key, hit); // refresh LRU position
    return hit.rows;
  }
  const version = versions.get(key) || 0;
  const loadKey = `${key}:${model}:${version}`;
  if (!loading.has(loadKey)) {
    loading.set(
      loadKey,
      (async () => {
        const docs = await Chunk.find({ user: userId, embeddingModel: model }, { resource: 1, embedding: 1 }).select('+embedding').limit(MAX_ROWS).lean();
        const rows = docs.filter((d) => d.embedding?.length).map((d) => ({ id: d._id, resource: String(d.resource), vec: Float32Array.from(d.embedding) }));
        if ((versions.get(key) || 0) === version) cache.set(key, { model, rows });
        while (cache.size > MAX_USERS) cache.delete(cache.keys().next().value);
        return rows;
      })().finally(() => loading.delete(loadKey))
    );
  }
  return loading.get(loadKey);
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function cacheStats() {
  return { users: cache.size };
}

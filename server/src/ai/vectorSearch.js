import mongoose from 'mongoose';
import env from '../config/env.js';
import Chunk from '../models/Chunk.js';

/**
 * Semantic nearest-neighbour search over a user's chunk embeddings.
 *
 * - atlas: MongoDB Atlas Vector Search ($vectorSearch) with a pre-filter on `user` and
 *   `embeddingModel`, so the index never returns another user's passages.
 * - local: exact cosine similarity computed in-process over the user's own vectors.
 *   Vectors are unit length, so cosine = dot product. Exact search is fast at
 *   personal-library scale (tens of thousands of passages) and needs no extra infrastructure.
 * - auto: try Atlas; fall back to local when $vectorSearch is unavailable (local MongoDB,
 *   in-memory dev DB) or the index is missing/still building.
 */
const LOCAL_SCAN_LIMIT = 50000;
let atlasState = env.VECTOR_SEARCH === 'local' ? 'unavailable' : 'unknown'; // unknown | available | unavailable

export function vectorSearchMode() {
  if (env.VECTOR_SEARCH === 'local') return 'local';
  if (env.VECTOR_SEARCH === 'atlas') return 'atlas';
  return atlasState === 'available' ? 'atlas' : atlasState === 'unavailable' ? 'local' : 'auto (detecting)';
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function atlasSearch(userId, vector, model, limit, resourceIds) {
  return Chunk.aggregate([
    {
      $vectorSearch: {
        index: env.VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: vector,
        numCandidates: Math.max(100, limit * 15),
        limit,
        filter: {
          user: new mongoose.Types.ObjectId(String(userId)),
          embeddingModel: model,
          ...(resourceIds ? { resource: { $in: resourceIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } : {}),
        },
      },
    },
    { $project: { resource: 1, index: 1, text: 1, page: 1, pageEnd: 1, heading: 1, resourceType: 1, score: { $meta: 'vectorSearchScore' } } },
  ]);
}

async function localSearch(userId, vector, model, limit, resourceIds) {
  const rows = await Chunk.find({ user: userId, embeddingModel: model, ...(resourceIds ? { resource: { $in: resourceIds } } : {}) }, { resource: 1, embedding: 1 }).select('+embedding').limit(LOCAL_SCAN_LIMIT).lean();
  const scored = [];
  for (const r of rows) {
    if (!r.embedding || r.embedding.length !== vector.length) continue;
    scored.push({ _id: r._id, score: dot(vector, r.embedding) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const docs = await Chunk.find({ _id: { $in: top.map((t) => t._id) }, user: userId }, { resource: 1, index: 1, text: 1, page: 1, pageEnd: 1, heading: 1, resourceType: 1 }).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return top.map((t) => ({ ...byId.get(String(t._id)), score: t.score })).filter((d) => d.text);
}

/**
 * Returns [{ _id, resource, text, page, heading, score }] (score: cosine similarity, 0–1 for
 * Atlas cosine indexes - Atlas reports (1 + cos) / 2, which is normalised back here).
 */
export async function vectorSearch(userId, vector, model, { limit = 20, resourceIds = null } = {}) {
  if (atlasState !== 'unavailable') {
    try {
      const hits = await atlasSearch(userId, vector, model, limit, resourceIds);
      if (hits.length || env.VECTOR_SEARCH === 'atlas') {
        atlasState = 'available';
        return { strategy: 'atlas', hits: hits.map((h) => ({ ...h, score: h.score * 2 - 1 })) };
      }
      // Zero hits can mean the index doesn't exist yet: confirm with an exact local search.
      const local = await localSearch(userId, vector, model, limit, resourceIds);
      if (local.length) return { strategy: 'local', hits: local };
      return { strategy: 'atlas', hits: [] };
    } catch (err) {
      if (env.VECTOR_SEARCH === 'atlas') throw err;
      atlasState = 'unavailable';
    }
  }
  return { strategy: 'local', hits: await localSearch(userId, vector, model, limit, resourceIds) };
}

/** Atlas Vector Search index definition for the chunks collection. */
export function atlasIndexDefinition(dimensions) {
  return {
    name: env.VECTOR_INDEX_NAME,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' },
        { type: 'filter', path: 'user' },
        { type: 'filter', path: 'embeddingModel' },
        { type: 'filter', path: 'resource' },
      ],
    },
  };
}

import mongoose from 'mongoose';
import env from '../config/env.js';
import Chunk from '../models/Chunk.js';
import Resource from '../models/Resource.js';
import { getEmbeddingProvider } from './providers.js';
import { vectorSearch } from './vectorSearch.js';
import { embedQuery } from './queryEmbedding.js';

/**
 * Hybrid retrieval for "My Knowledge" answers.
 *
 * 1. Embed the query and run a vector search over the user's passages (semantic).
 * 2. Run a full-text search over the same user's passages (exact terms, names, codes).
 * 3. Fuse both rankings with Reciprocal Rank Fusion, drop weak semantic-only matches,
 *    and cap passages per item so one long document can't crowd out everything else.
 *
 * Every query is filtered by the requesting user's id. If no embedding provider is
 * configured, retrieval runs keyword-only and reports that strategy honestly.
 */
const RRF_K = 60;
const MAX_PER_RESOURCE = 3;

export async function retrieve(userId, query, { limit = env.RAG_TOP_K } = {}) {
  const user = new mongoose.Types.ObjectId(String(userId));
  const provider = getEmbeddingProvider({ required: false });
  const candidates = new Map();
  const add = (hit, field, rank, score) => {
    const key = String(hit._id);
    const entry = candidates.get(key) || { ...hit, vectorRank: null, keywordRank: null, similarity: null, fused: 0 };
    entry[field] = rank;
    if (field === 'vectorRank') entry.similarity = score;
    entry.fused += 1 / (RRF_K + rank);
    candidates.set(key, entry);
  };

  let strategy = 'keyword';
  let semanticError = null;
  if (provider) {
    try {
      const vector = await embedQuery(provider, query);
      const res = await vectorSearch(user, vector, provider.id, { limit: 24 });
      strategy = res.strategy === 'atlas' ? 'hybrid (Atlas vector + keyword)' : 'hybrid (vector + keyword)';
      res.hits.forEach((h, i) => add(h, 'vectorRank', i + 1, h.score));
    } catch (err) {
      semanticError = err.message;
    }
  }

  const keywordHits = await Chunk.aggregate([
    { $match: { $text: { $search: query.slice(0, 500) }, user } },
    { $project: { resource: 1, index: 1, text: 1, page: 1, pageEnd: 1, heading: 1, resourceType: 1, kscore: { $meta: 'textScore' } } },
    { $sort: { kscore: -1 } },
    { $limit: 24 },
  ]);
  keywordHits.forEach((h, i) => add(h, 'keywordRank', i + 1, h.kscore));

  // A semantic-only match must clear the similarity floor; keyword matches are kept on merit.
  let ranked = [...candidates.values()]
    .filter((c) => c.keywordRank !== null || (c.similarity ?? 0) >= env.RAG_MIN_SCORE)
    .sort((a, b) => b.fused - a.fused);

  const perResource = new Map();
  ranked = ranked.filter((c) => {
    const n = perResource.get(String(c.resource)) || 0;
    if (n >= MAX_PER_RESOURCE) return false;
    perResource.set(String(c.resource), n + 1);
    return true;
  });
  ranked = ranked.slice(0, limit);

  // Attach item titles/types; also re-checks ownership of every resource returned.
  const resources = await Resource.find({ _id: { $in: ranked.map((c) => c.resource) }, user }, { title: 1, type: 1, 'file.pageCount': 1, 'link.domain': 1 }).lean();
  const byId = new Map(resources.map((r) => [String(r._id), r]));

  const passages = ranked
    .filter((c) => byId.has(String(c.resource)))
    .map((c, i) => {
      const r = byId.get(String(c.resource));
      return {
        n: i + 1,
        chunkId: String(c._id),
        resourceId: String(c.resource),
        resourceType: r.type,
        title: r.title,
        domain: r.link?.domain || null,
        text: c.text,
        page: c.page ?? null,
        pageEnd: c.pageEnd ?? null,
        heading: c.heading ?? null,
        chunkIndex: c.index,
        similarity: c.similarity !== null ? Number(c.similarity.toFixed(3)) : null,
        matchedBy: [c.vectorRank !== null && 'semantic', c.keywordRank !== null && 'keyword'].filter(Boolean),
      };
    });

  return { strategy, passages, semanticError };
}

/** Plain semantic search for the Smart Search page (Phase 4) and diagnostics. */
export async function countIndexed(userId) {
  const provider = getEmbeddingProvider({ required: false });
  const [items, embedded] = await Promise.all([
    Resource.countDocuments({ user: userId }),
    provider ? Chunk.countDocuments({ user: userId, embeddingModel: provider.id }) : 0,
  ]);
  return { items, embeddedPassages: embedded };
}

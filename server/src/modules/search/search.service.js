import mongoose from 'mongoose';
import env from '../../config/env.js';
import Resource from '../../models/Resource.js';
import Chunk from '../../models/Chunk.js';
import Tag from '../../models/Tag.js';
import Collection from '../../models/Collection.js';
import SearchHistory from '../../models/SearchHistory.js';
import { getEmbeddingProvider } from '../../ai/providers.js';
import { vectorSearch } from '../../ai/vectorSearch.js';
import { embedQuery } from '../../ai/queryEmbedding.js';
import { escapeRegex } from '../../utils/validators.js';
import { serializeResource } from '../library/library.service.js';
import { logActivity } from '../timeline/activity.js';
import { findRanges, queryTerms, snippetWithHighlights } from './highlight.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const RRF_K = 60;
/** Weights for each ranked list when fusing (titles count most). */
const WEIGHTS = { title: 1.6, meta: 1.1, keyword: 1.0, semantic: 1.0 };
const MAX_FILTER_IDS = 5000;
const TAG_POPULATE = { path: 'tags', select: 'name color', options: { sort: { nameLower: 1 } } };

function resourceFilter(userId, p) {
  const f = { user: oid(userId) };
  if (p.type?.length) f.type = { $in: p.type };
  if (p.collection) f.collectionId = p.collection === 'none' ? null : oid(p.collection);
  if (p.tags?.length) f.tags = { $all: p.tags.map(oid) };
  if (p.pinned !== undefined) f.pinned = p.pinned;
  if (p.status) f['processing.status'] = p.status;
  if (p.from || p.to) {
    f.createdAt = {};
    if (p.from) f.createdAt.$gte = new Date(p.from);
    if (p.to) f.createdAt.$lte = new Date(p.to);
  }
  return f;
}

const hasFilters = (p) => Boolean(p.type?.length || p.collection || p.tags?.length || p.from || p.to || p.pinned !== undefined || p.status);

/**
 * Unified search across the user's library.
 *  mode "smart"    – keyword lists + semantic list, fused with Reciprocal Rank Fusion
 *  mode "keyword"  – titles, descriptions and full text only
 *  mode "semantic" – meaning only (embeddings)
 * Results are one entry per resource (no duplicates), each with up to two highlighted passages.
 */
export async function search(userId, p) {
  const user = oid(userId);
  const terms = queryTerms(p.q);
  const provider = getEmbeddingProvider({ required: false });
  const wantKeyword = p.mode !== 'semantic';
  const wantSemantic = p.mode !== 'keyword';

  // Restrict candidates up front when filters are set, so filtered searches stay complete.
  let allowed = null;
  if (hasFilters(p)) {
    const ids = await Resource.find(resourceFilter(userId, p), { _id: 1 }).limit(MAX_FILTER_IDS).lean();
    allowed = ids.map((r) => r._id);
    if (!allowed.length) return emptyResult(p, provider, wantSemantic);
  }
  const scope = allowed ? { _id: { $in: allowed } } : {};
  const chunkScope = allowed ? { resource: { $in: allowed } } : {};

  const lists = {};
  const tasks = [];
  if (wantKeyword) {
    tasks.push(
      Resource.find({ user, ...scope, title: { $regex: escapeRegex(p.q.slice(0, 100)), $options: 'i' } }, { _id: 1 })
        .limit(100)
        .lean()
        .then((r) => (lists.title = r.map((x) => ({ resource: x._id })))),
      Resource.find({ user, ...scope, $text: { $search: p.q } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(150)
        .lean()
        .then((r) => (lists.meta = r.map((x) => ({ resource: x._id })))),
      Chunk.aggregate([
        { $match: { $text: { $search: p.q }, user, ...chunkScope } },
        { $project: { resource: 1, text: 1, page: 1, pageEnd: 1, heading: 1, index: 1, s: { $meta: 'textScore' } } },
        { $sort: { s: -1 } },
        { $limit: 300 },
      ]).then((r) => (lists.keyword = r))
    );
  }
  let semantic = { available: Boolean(provider), used: false, reason: null };
  if (wantSemantic) {
    if (!provider) {
      semantic.reason = 'Semantic search needs an embedding provider (see Settings → AI assistant). Showing keyword matches.';
    } else {
      tasks.push(
        embedQuery(provider, p.q)
          .then((vec) => vectorSearch(user, vec, provider.id, { limit: 80, resourceIds: allowed }))
          .then((res) => {
            lists.semantic = res.hits.filter((h) => h.score >= env.RAG_MIN_SCORE);
            semantic = { ...semantic, used: true, strategy: res.strategy };
          })
          .catch((err) => {
            semantic.reason = `Semantic search failed (${err.message}). Showing keyword matches.`;
          })
      );
    }
  }
  await Promise.all(tasks);

  // Fuse at the resource level: each list contributes by the rank of the resource's best hit.
  const byResource = new Map();
  const entry = (rid) => {
    const key = String(rid);
    if (!byResource.has(key)) byResource.set(key, { score: 0, matchedBy: new Set(), passages: new Map(), similarity: null });
    return byResource.get(key);
  };
  for (const [name, hits] of Object.entries(lists)) {
    const seen = new Set();
    let rank = 0;
    for (const h of hits || []) {
      const key = String(h.resource);
      const e = entry(h.resource);
      if (h.text && e.passages.size < 4 && !e.passages.has(String(h._id))) e.passages.set(String(h._id), { ...h, via: name });
      if (name === 'semantic' && (e.similarity === null || h.score > e.similarity)) e.similarity = h.score;
      if (seen.has(key)) continue;
      seen.add(key);
      rank += 1;
      e.score += WEIGHTS[name] / (RRF_K + rank);
      // 'meta' covers title, description and excerpt matches, so it counts as an exact-word match.
      e.matchedBy.add(name === 'meta' ? 'keyword' : name);
    }
  }

  const ids = [...byResource.keys()];
  if (!ids.length) return emptyResult(p, provider, wantSemantic, semantic);

  let docs = await Resource.find({ _id: { $in: ids.map(oid) }, user }).populate(TAG_POPULATE).lean();
  const by = (key) => (a, b) => new Date(b[key] || 0) - new Date(a[key] || 0);
  if (p.sort === 'newest' || p.sort === 'created') docs.sort(by('createdAt'));
  else if (p.sort === 'oldest') docs.sort((a, b) => a.createdAt - b.createdAt);
  else if (p.sort === 'updated') docs.sort(by('updatedAt'));
  else if (p.sort === 'accessed') docs.sort(by('lastAccessedAt'));
  else if (p.sort === 'title') docs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  else docs.sort((a, b) => byResource.get(String(b._id)).score - byResource.get(String(a._id)).score);

  const total = docs.length;
  docs = docs.slice((p.page - 1) * p.limit, p.page * p.limit);

  const items = docs.map((d) => {
    const e = byResource.get(String(d._id));
    // Prefer passages that contain the query words; then the strongest semantic passage.
    const passages = [...e.passages.values()]
      .sort((a, b) => (a.via === 'keyword' ? 0 : 1) - (b.via === 'keyword' ? 0 : 1) || (b.score ?? b.s ?? 0) - (a.score ?? a.s ?? 0))
      .slice(0, 2)
      .map((h) => {
        const snip = snippetWithHighlights(h.text, terms);
        return {
          chunkIndex: h.index,
          page: h.page ?? null,
          pageEnd: h.pageEnd ?? null,
          heading: h.heading ?? null,
          text: snip.text,
          highlights: snip.highlights,
          matchedBy: h.via === 'semantic' ? 'semantic' : 'keyword',
          similarity: h.via === 'semantic' ? Number(h.score.toFixed(3)) : null,
        };
      });
    const fallback = !passages.length && (d.excerpt || d.link?.description) ? snippetWithHighlights(d.excerpt || d.link.description, terms) : null;
    return {
      resource: serializeResource(d),
      score: Number(e.score.toFixed(4)),
      matchedBy: [...e.matchedBy],
      similarity: e.similarity !== null ? Number(e.similarity.toFixed(3)) : null,
      titleHighlights: findRanges(d.title, terms),
      passages: passages.length ? passages : fallback ? [{ ...fallback, matchedBy: 'title', page: null, heading: null }] : [],
    };
  });

  return { items, total, page: p.page, limit: p.limit, hasMore: p.page * p.limit < total, terms, mode: p.mode, semantic };
}

function emptyResult(p, provider, wantSemantic, semantic) {
  return {
    items: [],
    total: 0,
    page: p.page,
    limit: p.limit,
    hasMore: false,
    terms: queryTerms(p.q),
    mode: p.mode,
    semantic: semantic || { available: Boolean(provider), used: false, reason: wantSemantic && !provider ? 'Semantic search needs an embedding provider.' : null },
  };
}

export async function recordSearch(userId, query, resultCount) {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return;
  const prev = await SearchHistory.findOneAndUpdate(
    { user: userId, queryLower: q.toLowerCase() },
    { $set: { query: q, resultCount, lastSearchedAt: new Date() }, $inc: { count: 1 }, $setOnInsert: { user: userId, queryLower: q.toLowerCase() } },
    { upsert: true, returnDocument: 'before' }
  );
  // Each distinct topic appears on the timeline once a day at most.
  if (!prev || Date.now() - prev.lastSearchedAt.getTime() > 24 * 60 * 60 * 1000) {
    logActivity(userId, 'search', { title: q, meta: { resultCount } });
  }
  // Keep the history bounded.
  const stale = await SearchHistory.find({ user: userId }, { _id: 1 }).sort({ lastSearchedAt: -1 }).skip(50).lean();
  if (stale.length) await SearchHistory.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
}

export async function recentSearches(userId, limit = 10) {
  const rows = await SearchHistory.find({ user: userId }).sort({ lastSearchedAt: -1 }).limit(limit).lean();
  return rows.map((r) => ({ id: String(r._id), query: r.query, resultCount: r.resultCount, count: r.count, lastSearchedAt: r.lastSearchedAt }));
}

export async function deleteRecent(userId, id) {
  if (id) await SearchHistory.deleteOne({ _id: id, user: userId });
  else await SearchHistory.deleteMany({ user: userId });
}

/** Type-ahead suggestions: matching titles, tags, collections and past searches. */
export async function suggest(userId, q) {
  const re = { $regex: `(^|\\s)${escapeRegex(q.slice(0, 60))}`, $options: 'i' };
  const [titles, tags, collections, past] = await Promise.all([
    Resource.find({ user: userId, title: re }, { title: 1, type: 1 }).sort({ lastAccessedAt: -1, updatedAt: -1 }).limit(6).lean(),
    Tag.find({ user: userId, name: re }, { name: 1 }).limit(4).lean(),
    Collection.find({ user: userId, name: re }, { name: 1 }).limit(3).lean(),
    SearchHistory.find({ user: userId, query: re }, { query: 1 }).sort({ lastSearchedAt: -1 }).limit(4).lean(),
  ]);
  return {
    resources: titles.map((r) => ({ id: String(r._id), title: r.title, type: r.type })),
    tags: tags.map((t) => ({ id: String(t._id), name: t.name })),
    collections: collections.map((c) => ({ id: String(c._id), name: c.name })),
    recent: past.map((s) => s.query),
  };
}

import mongoose from 'mongoose';
import env from '../../config/env.js';
import Resource from '../../models/Resource.js';
import Collection from '../../models/Collection.js';
import Tag from '../../models/Tag.js';
import Connection, { orderPair } from '../../models/Connection.js';
import GraphLayout from '../../models/GraphLayout.js';
import ApiError from '../../utils/ApiError.js';
import { getChatProvider } from '../../ai/providers.js';
import { logActivity } from '../timeline/activity.js';
import { similarityModel } from './similarity.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
export const MAX_GRAPH_RESOURCES = 400;

/** Minimum similarity for a suggestion, by method (embedding cosines run higher than TF-IDF). */
const MIN_SCORE = { embeddings: env.GRAPH_SUGGEST_MIN_EMBEDDING, keywords: env.GRAPH_SUGGEST_MIN_KEYWORD };
const NEIGHBOURS_PER_ITEM = 2;

function serializeConnection(c, titles) {
  return {
    id: String(c._id),
    sourceId: String(c.a),
    targetId: String(c.b),
    sourceTitle: titles?.get(String(c.a)) ?? null,
    targetTitle: titles?.get(String(c.b)) ?? null,
    kind: c.kind,
    status: c.status,
    label: c.label,
    reason: c.reason,
    score: c.score,
    method: c.method,
    createdAt: c.createdAt,
  };
}

/**
 * Builds the graph: resources (notes, documents, links), topics (tags), collections, and the
 * edges between them (tagged-with, contained-in, nested-in, and accepted connections).
 */
export async function getGraph(userId, q) {
  const user = oid(userId);
  const filter = { user };
  if (q.types?.length) filter.type = { $in: q.types };
  if (q.collection) filter.collectionId = q.collection === 'none' ? null : oid(q.collection);
  if (q.tag) filter.tags = oid(q.tag);

  const total = await Resource.countDocuments(filter);
  const resources = await Resource.find(filter, { title: 1, type: 1, collectionId: 1, tags: 1, pinned: 1, createdAt: 1, 'processing.status': 1, 'link.domain': 1 })
    .sort({ pinned: -1, lastAccessedAt: -1, updatedAt: -1 })
    .limit(MAX_GRAPH_RESOURCES)
    .lean();
  const ids = resources.map((r) => r._id);
  const idSet = new Set(ids.map(String));

  const [connections, layout] = await Promise.all([
    Connection.find({ user, status: 'accepted', a: { $in: ids }, b: { $in: ids } }).lean(),
    GraphLayout.findOne({ user }).lean(),
  ]);

  const nodes = [];
  const edges = [];
  const degree = new Map();
  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);

  for (const r of resources) {
    nodes.push({
      id: `r:${r._id}`,
      kind: 'resource',
      resourceId: String(r._id),
      resourceType: r.type,
      label: r.title,
      pinned: Boolean(r.pinned),
      collectionId: r.collectionId ? String(r.collectionId) : null,
      tagIds: (r.tags || []).map(String),
      domain: r.link?.domain || null,
      createdAt: r.createdAt,
      status: r.processing?.status,
    });
  }

  if (q.showTopics) {
    const tagIds = [...new Set(resources.flatMap((r) => (r.tags || []).map(String)))];
    const tags = await Tag.find({ user, _id: { $in: tagIds.map(oid) } }, { name: 1, color: 1 }).lean();
    for (const t of tags) nodes.push({ id: `t:${t._id}`, kind: 'topic', tagId: String(t._id), label: t.name });
    const tagSet = new Set(tags.map((t) => String(t._id)));
    for (const r of resources) {
      for (const t of r.tags || []) {
        if (!tagSet.has(String(t))) continue;
        edges.push({ id: `rt:${r._id}:${t}`, source: `r:${r._id}`, target: `t:${t}`, kind: 'topic' });
        bump(`r:${r._id}`);
        bump(`t:${t}`);
      }
    }
  }

  if (q.showCollections) {
    // Include the collections that hold these resources, plus their ancestors.
    const all = await Collection.find({ user }, { name: 1, parent: 1 }).lean();
    const byId = new Map(all.map((c) => [String(c._id), c]));
    const needed = new Set();
    for (const r of resources) {
      let cur = r.collectionId ? String(r.collectionId) : null;
      while (cur && !needed.has(cur) && byId.has(cur)) {
        needed.add(cur);
        cur = byId.get(cur).parent ? String(byId.get(cur).parent) : null;
      }
    }
    for (const id of needed) {
      const c = byId.get(id);
      nodes.push({ id: `c:${id}`, kind: 'collection', collectionId: id, label: c.name });
      if (c.parent && needed.has(String(c.parent))) {
        edges.push({ id: `cc:${id}`, source: `c:${c.parent}`, target: `c:${id}`, kind: 'nested' });
        bump(`c:${id}`);
        bump(`c:${c.parent}`);
      }
    }
    for (const r of resources) {
      if (r.collectionId && needed.has(String(r.collectionId))) {
        edges.push({ id: `rc:${r._id}`, source: `c:${r.collectionId}`, target: `r:${r._id}`, kind: 'collection' });
        bump(`r:${r._id}`);
        bump(`c:${r.collectionId}`);
      }
    }
  }

  for (const c of connections) {
    if (!idSet.has(String(c.a)) || !idSet.has(String(c.b))) continue;
    edges.push({ id: `x:${c._id}`, source: `r:${c.a}`, target: `r:${c.b}`, kind: c.kind === 'ai' ? 'ai' : 'manual', label: c.label, connectionId: String(c._id), reason: c.reason });
    bump(`r:${c.a}`);
    bump(`r:${c.b}`);
  }

  const positions = layout?.positions ? Object.fromEntries(Object.entries(layout.positions)) : {};
  for (const n of nodes) {
    n.degree = degree.get(n.id) || 0;
    if (positions[n.id]) n.position = positions[n.id];
  }
  return { nodes, edges, truncated: total > resources.length, total, shown: resources.length };
}

async function assertResourcesOwned(userId, ids) {
  const found = await Resource.find({ _id: { $in: ids }, user: userId }, { _id: 1, title: 1 }).lean();
  if (found.length !== new Set(ids.map(String)).size) throw ApiError.badRequest('One or both items were not found');
  return new Map(found.map((r) => [String(r._id), r.title]));
}

export async function createConnection(userId, { sourceId, targetId, label = '' }) {
  if (String(sourceId) === String(targetId)) throw ApiError.badRequest('An item cannot be connected to itself');
  const titles = await assertResourcesOwned(userId, [sourceId, targetId]);
  const [a, b] = orderPair(oid(sourceId), oid(targetId));
  const existing = await Connection.findOne({ user: userId, a, b });
  if (existing?.status === 'accepted') throw ApiError.conflict('These items are already connected', 'ALREADY_CONNECTED');
  const conn = existing
    ? Object.assign(existing, { kind: 'manual', status: 'accepted', label, decidedAt: new Date() })
    : new Connection({ user: userId, a, b, kind: 'manual', status: 'accepted', label, decidedAt: new Date() });
  await conn.save();
  logActivity(userId, 'connection_created', { resource: a, title: `${titles.get(String(a))} ↔ ${titles.get(String(b))}`, meta: { connectionId: String(conn._id), kind: 'manual' } });
  return serializeConnection(conn, titles);
}

export async function updateConnection(userId, id, { label }) {
  const c = await Connection.findOneAndUpdate({ _id: id, user: userId, status: 'accepted' }, { $set: { label } }, { returnDocument: 'after' });
  if (!c) throw ApiError.notFound('Connection not found');
  return serializeConnection(c);
}

/** Manual connections are deleted; removed AI connections are remembered so they aren't suggested again. */
export async function deleteConnection(userId, id) {
  const c = await Connection.findOne({ _id: id, user: userId, status: 'accepted' });
  if (!c) throw ApiError.notFound('Connection not found');
  if (c.kind === 'ai') {
    c.status = 'removed';
    c.decidedAt = new Date();
    await c.save();
  } else {
    await c.deleteOne();
  }
}

export async function listSuggestions(userId) {
  const rows = await Connection.find({ user: userId, status: 'suggested' }).sort({ score: -1 }).limit(50).lean();
  const titles = await titleMap(userId, rows.flatMap((r) => [r.a, r.b]));
  return rows.filter((r) => titles.has(String(r.a)) && titles.has(String(r.b))).map((r) => serializeConnection(r, titles));
}

async function titleMap(userId, ids) {
  const rows = await Resource.find({ _id: { $in: ids }, user: userId }, { title: 1 }).lean();
  return new Map(rows.map((r) => [String(r._id), r.title]));
}

export async function decideSuggestion(userId, id, accept) {
  const c = await Connection.findOne({ _id: id, user: userId, status: 'suggested' });
  if (!c) throw ApiError.notFound('Suggestion not found');
  c.status = accept ? 'accepted' : 'dismissed';
  c.decidedAt = new Date();
  await c.save();
  const titles = await titleMap(userId, [c.a, c.b]);
  if (accept) logActivity(userId, 'connection_created', { resource: c.a, title: `${titles.get(String(c.a))} ↔ ${titles.get(String(c.b))}`, meta: { connectionId: String(c._id), kind: 'ai' } });
  return serializeConnection(c, titles);
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          related: { type: 'boolean' },
          label: { type: 'string', description: '2-4 word relationship label' },
          reason: { type: 'string', description: 'One sentence, under 25 words' },
        },
        required: ['index', 'related', 'label', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['pairs'],
  additionalProperties: false,
};

/**
 * Proposes a small number of meaningful connections:
 * 1. score every pair of the user's items (embeddings, or TF-IDF without an embedding key),
 * 2. keep each item's top neighbours above a similarity floor, skipping pairs that were
 *    ever connected, suggested or dismissed,
 * 3. if an AI provider is configured, ask it to confirm each pair is genuinely related and
 *    write a short label and reason; pairs it judges unrelated are dropped.
 * Suggestions are never added to the graph until the user accepts them.
 */
export async function generateSuggestions(userId, { limit = 8 } = {}) {
  const user = oid(userId);
  const resources = await Resource.find({ user, 'processing.status': 'ready', 'processing.chunkCount': { $gt: 0 } }, { title: 1, excerpt: 1, type: 1 })
    .sort({ updatedAt: -1 })
    .limit(MAX_GRAPH_RESOURCES)
    .lean();
  if (resources.length < 2) return { created: [], method: null, considered: 0, message: 'Add at least two items with text to get suggestions.' };

  const model = await similarityModel(user, resources);
  const floor = MIN_SCORE[model.method];
  const known = await Connection.find({ user }, { a: 1, b: 1 }).lean();
  const knownKeys = new Set(known.map((c) => `${c.a}:${c.b}`));

  const ids = resources.map((r) => String(r._id));
  const best = new Map();
  for (let i = 0; i < ids.length; i++) {
    const scored = [];
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      const s = model.sim(ids[i], ids[j]);
      if (s !== null && s >= floor) scored.push([j, s]);
    }
    scored.sort((x, y) => y[1] - x[1]);
    for (const [j, s] of scored.slice(0, NEIGHBOURS_PER_ITEM)) {
      const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
      const key = `${a}:${b}`;
      if (knownKeys.has(key)) continue;
      if (!best.has(key) || best.get(key).score < s) best.set(key, { a, b, score: s });
    }
  }

  let candidates = [...best.values()].sort((x, y) => y.score - x.score).slice(0, limit * 2);
  const byId = new Map(resources.map((r) => [String(r._id), r]));
  const enriched = candidates.map((c) => ({ ...c, terms: model.explain(c.a, c.b) }));

  // Ask the model to confirm relevance and describe the relationship (best-effort).
  const provider = getChatProvider({ required: false });
  let reviewed = null;
  if (provider && enriched.length) {
    try {
      const listing = enriched
        .map((c, i) => {
          const A = byId.get(c.a);
          const B = byId.get(c.b);
          return `${i}. A: "${A.title}" (${A.type}): ${(A.excerpt || '').slice(0, 280)}\n   B: "${B.title}" (${B.type}): ${(B.excerpt || '').slice(0, 280)}`;
        })
        .join('\n');
      const out = await provider.completeJson({
        system: 'You judge whether two items in a personal knowledge base are meaningfully related. Be strict: shared generic words are not enough.',
        prompt: `For each numbered pair, decide if a reader would benefit from a link between A and B. Give a short relationship label (e.g. "explains", "same topic", "example of", "contrasts with") and a one-sentence reason.\n\n${listing}`,
        schema: REVIEW_SCHEMA,
        maxTokens: 2000,
      });
      if (out?.pairs) reviewed = new Map(out.pairs.map((p) => [p.index, p]));
    } catch {
      reviewed = null;
    }
  }

  const docs = [];
  enriched.forEach((c, i) => {
    const r = reviewed?.get(i);
    if (reviewed && (!r || !r.related)) return;
    docs.push({
      user,
      a: oid(c.a),
      b: oid(c.b),
      kind: 'ai',
      status: 'suggested',
      score: Number(c.score.toFixed(3)),
      method: reviewed ? `${model.method}+ai-review` : model.method,
      label: r?.label?.slice(0, 60) || (c.terms[0] ? `about ${c.terms[0]}` : 'related'),
      reason: (r?.reason || (c.terms.length ? `Both discuss ${c.terms.join(', ')}.` : 'Similar content.')).slice(0, 300),
    });
  });

  const created = [];
  for (const d of docs.slice(0, limit)) {
    try {
      created.push(await Connection.create(d));
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  const titles = new Map(resources.map((r) => [String(r._id), r.title]));
  return { created: created.map((c) => serializeConnection(c, titles)), method: docs[0]?.method || model.method, considered: candidates.length };
}

/** Items most similar to one resource, plus its explicit connections. */
export async function related(userId, resourceId) {
  const user = oid(userId);
  const target = await Resource.findOne({ _id: resourceId, user }, { _id: 1 }).lean();
  if (!target) throw ApiError.notFound('Item not found');
  const resources = await Resource.find({ user, 'processing.status': 'ready', 'processing.chunkCount': { $gt: 0 } }, { title: 1, type: 1 }).limit(MAX_GRAPH_RESOURCES).lean();
  const conns = await Connection.find({ user, status: 'accepted', $or: [{ a: target._id }, { b: target._id }] }).lean();
  const titles = new Map(resources.map((r) => [String(r._id), r]));
  const connected = conns
    .map((c) => {
      const other = String(c.a) === String(target._id) ? c.b : c.a;
      const r = titles.get(String(other));
      return r && { id: String(other), title: r.title, type: r.type, label: c.label, connectionId: String(c._id), kind: c.kind };
    })
    .filter(Boolean);

  let similar = [];
  if (resources.some((r) => String(r._id) === String(target._id)) && resources.length > 1) {
    const model = await similarityModel(user, resources);
    const floor = MIN_SCORE[model.method];
    const connectedIds = new Set(connected.map((c) => c.id));
    similar = resources
      .filter((r) => String(r._id) !== String(target._id) && !connectedIds.has(String(r._id)))
      .map((r) => ({ r, s: model.sim(String(target._id), String(r._id)) }))
      .filter((x) => x.s !== null && x.s >= floor * 0.85)
      .sort((x, y) => y.s - x.s)
      .slice(0, 6)
      .map(({ r, s }) => ({ id: String(r._id), title: r.title, type: r.type, score: Number(s.toFixed(3)), method: model.method }));
  }
  return { connected, similar };
}

export async function saveLayout(userId, positions) {
  const $set = {};
  for (const [nodeId, p] of Object.entries(positions)) $set[`positions.${nodeId.replace(/\./g, '_')}`] = { x: Math.round(p.x), y: Math.round(p.y) };
  await GraphLayout.updateOne({ user: userId }, { $set, $setOnInsert: { user: userId } }, { upsert: true });
}

export async function resetLayout(userId) {
  await GraphLayout.deleteOne({ user: userId });
}

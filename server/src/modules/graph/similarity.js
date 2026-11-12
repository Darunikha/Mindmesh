import Chunk from '../../models/Chunk.js';
import { getEmbeddingProvider } from '../../ai/providers.js';

/**
 * Resource-to-resource similarity for relationship suggestions and "related items".
 *
 * - embeddings: each resource is represented by the normalised mean (centroid) of its
 *   passage embeddings; similarity is cosine.
 * - keywords:   TF-IDF over each resource's title and leading passages, when no embedding
 *   provider is configured. Also yields the shared terms used to explain a suggestion.
 */
const STOP = new Set(
  'the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into also each which their there these those then would about could other after first because being between both during through while where should might must does done using used upon within without'.split(
    ' '
  )
);

function tokens(text) {
  return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((w) => !STOP.has(w));
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function embeddingVectors(userId, resourceIds, modelId) {
  const rows = await Chunk.find({ user: userId, resource: { $in: resourceIds }, embeddingModel: modelId }, { resource: 1, embedding: 1 }).select('+embedding').lean();
  const sums = new Map();
  for (const r of rows) {
    if (!r.embedding?.length) continue;
    const key = String(r.resource);
    const acc = sums.get(key);
    if (!acc) sums.set(key, r.embedding.slice());
    else for (let i = 0; i < acc.length; i++) acc[i] += r.embedding[i];
  }
  const out = new Map();
  for (const [k, v] of sums) {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    out.set(k, v.map((x) => x / n));
  }
  return out;
}

async function tfidfVectors(userId, resources) {
  const chunks = await Chunk.find({ user: userId, resource: { $in: resources.map((r) => r._id) }, index: { $lt: 6 } }, { resource: 1, text: 1 }).lean();
  const text = new Map(resources.map((r) => [String(r._id), `${r.title} ${r.title} `]));
  for (const c of chunks) text.set(String(c.resource), `${text.get(String(c.resource)) || ''} ${c.text}`);

  const tfs = new Map();
  const df = new Map();
  for (const [id, t] of text) {
    const tf = new Map();
    for (const w of tokens(t)) tf.set(w, (tf.get(w) || 0) + 1);
    tfs.set(id, tf);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = tfs.size;
  const out = new Map();
  for (const [id, tf] of tfs) {
    const vec = new Map();
    let norm = 0;
    for (const [w, c] of tf) {
      const d = df.get(w);
      if (d < 2 && n > 2) continue; // words unique to one item can't connect anything
      const weight = (1 + Math.log(c)) * Math.log((n + 1) / d);
      if (weight <= 0) continue;
      vec.set(w, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, v] of vec) vec.set(w, v / norm);
    out.set(id, vec);
  }
  return out;
}

function sparseDot(a, b) {
  let s = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [w, v] of small) {
    const o = big.get(w);
    if (o) s += v * o;
  }
  return s;
}

export function sharedTerms(a, b, n = 3) {
  return [...a.entries()]
    .filter(([w]) => b.has(w))
    .map(([w, v]) => [w, v * b.get(w)])
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([w]) => w);
}

/**
 * Builds a similarity function over the given resources.
 * Returns { method, sim(idA, idB) -> number|null, explain(idA, idB) -> string[] }.
 */
export async function similarityModel(userId, resources) {
  const ids = resources.map((r) => r._id);
  const provider = getEmbeddingProvider({ required: false });
  let emb = null;
  if (provider) {
    emb = await embeddingVectors(userId, ids, provider.id);
    if (emb.size < Math.min(2, resources.length)) emb = null; // nothing embedded yet
  }
  const tfidf = await tfidfVectors(userId, resources);
  if (emb) {
    return {
      method: 'embeddings',
      sim: (a, b) => (emb.has(a) && emb.has(b) ? dot(emb.get(a), emb.get(b)) : null),
      explain: (a, b) => (tfidf.has(a) && tfidf.has(b) ? sharedTerms(tfidf.get(a), tfidf.get(b)) : []),
    };
  }
  return {
    method: 'keywords',
    sim: (a, b) => (tfidf.has(a) && tfidf.has(b) ? sparseDot(tfidf.get(a), tfidf.get(b)) : null),
    explain: (a, b) => sharedTerms(tfidf.get(a), tfidf.get(b)),
  };
}

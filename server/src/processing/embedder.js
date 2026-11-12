import crypto from 'node:crypto';
import Resource from '../models/Resource.js';
import Chunk from '../models/Chunk.js';
import { getEmbeddingProvider } from '../ai/providers.js';
import { createQueue } from './queue.js';

/**
 * Embedding pipeline: (chunks already extracted) → embed only passages whose text or model
 * changed → store vectors on the Chunk documents with model/version info → mark the
 * resource's semantic index ready/failed.
 */
export const embeddingQueue = createQueue({ name: 'embedding', concurrency: 1 });

/** Notes are re-chunked on every autosave; wait for a pause in typing before embedding. */
export const NOTE_EMBED_DELAY_MS = 15000;
const MAX_RETRIES = 3;
const retries = new Map();

export const hashText = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Text sent to the embedding model: passage plus light context (title, section) for better recall. */
function embeddingInput(resource, chunk) {
  const parts = [`Title: ${resource.title}`];
  if (chunk.heading) parts.push(`Section: ${chunk.heading}`);
  parts.push(chunk.text);
  return parts.join('\n');
}

export async function scheduleEmbedding(resourceId, { delay = 0 } = {}) {
  const provider = getEmbeddingProvider({ required: false });
  await Resource.updateOne(
    { _id: resourceId },
    provider
      ? { $set: { 'embedding.status': 'pending', 'embedding.error': null } }
      : { $set: { 'embedding.status': 'disabled', 'embedding.error': null } },
    { timestamps: false }
  );
  if (provider) embeddingQueue.enqueue(resourceId, { delay });
}

async function setStatus(id, fields) {
  const $set = { 'embedding.updatedAt': new Date() };
  for (const [k, v] of Object.entries(fields)) $set[`embedding.${k}`] = v;
  await Resource.updateOne({ _id: id }, { $set }, { timestamps: false });
}

export async function embedResource(id) {
  const provider = getEmbeddingProvider({ required: false });
  if (!provider) return setStatus(id, { status: 'disabled' });

  const resource = await Resource.findById(id, { title: 1, user: 1 }).lean();
  if (!resource) return undefined;

  const chunks = await Chunk.find({ resource: id }, { text: 1, heading: 1, textHash: 1, embeddingModel: 1 }).sort({ index: 1 }).lean();
  const todo = chunks.filter((c) => c.embeddingModel !== provider.id);
  if (!todo.length) {
    return setStatus(id, { status: chunks.length ? 'ready' : 'none', model: provider.id, error: null, embeddedChunks: chunks.length });
  }

  await setStatus(id, { status: 'processing' });
  try {
    const vectors = await provider.embed(
      todo.map((c) => embeddingInput(resource, c)),
      { inputType: 'document' }
    );
    if (vectors.length !== todo.length) throw new Error('Embedding provider returned an unexpected number of vectors');
    const now = new Date();
    await Chunk.bulkWrite(
      todo.map((c, i) => ({
        updateOne: {
          // Match on the text hash too: if the note changed meanwhile, the stale vector is not stored.
          filter: { _id: c._id, ...(c.textHash ? { textHash: c.textHash } : {}) },
          update: {
            $set: { embedding: vectors[i], embeddingModel: provider.id, embeddedAt: now, ...(c.textHash ? {} : { textHash: hashText(c.text) }) },
          },
        },
      })),
      { ordered: false }
    );
    retries.delete(String(id));
    if (!(await Resource.exists({ _id: id }))) {
      await Chunk.deleteMany({ resource: id });
      return undefined;
    }
    const embedded = await Chunk.countDocuments({ resource: id, embeddingModel: provider.id });
    const total = await Chunk.countDocuments({ resource: id });
    // Chunks may have been replaced while we were embedding; if so, go round again.
    if (embedded < total) return embeddingQueue.enqueue(id, { delay: 1000 });
    return setStatus(id, { status: 'ready', model: provider.id, error: null, embeddedChunks: embedded });
  } catch (err) {
    const n = (retries.get(String(id)) || 0) + 1;
    retries.set(String(id), n);
    if (err.retryable && n < MAX_RETRIES) {
      await setStatus(id, { status: 'pending', error: `${err.message} Retrying…` });
      return embeddingQueue.enqueue(id, { delay: 5000 * n });
    }
    retries.delete(String(id));
    console.warn(`[mindmesh] Embedding failed for ${id}: ${err.message}`);
    return setStatus(id, { status: 'failed', error: err.message || 'Embedding failed' });
  }
}

embeddingQueue.setHandler(embedResource);

/**
 * Boot-time backfill: queues anything interrupted, plus Phase 2 content (or content embedded
 * with a different model) that has extracted text but no current embeddings.
 */
export async function recoverEmbeddings() {
  const provider = getEmbeddingProvider({ required: false });
  if (!provider) return 0;
  const ids = await Resource.find(
    {
      'processing.status': 'ready',
      'processing.chunkCount': { $gt: 0 },
      $or: [{ 'embedding.status': { $in: ['pending', 'processing', 'none', 'disabled'] } }, { 'embedding.model': { $ne: provider.id } }],
    },
    { _id: 1 }
  ).lean();
  ids.forEach((r) => embeddingQueue.enqueue(r._id));
  if (ids.length) console.log(`[mindmesh] Queued ${ids.length} item(s) for semantic indexing with ${provider.id}.`);
  return ids.length;
}

/** User-triggered rebuild. `force` discards existing vectors and re-embeds everything. */
export async function reindexUser(userId, { force = false } = {}) {
  const provider = getEmbeddingProvider();
  if (force) await Chunk.updateMany({ user: userId }, { $unset: { embedding: 1 }, $set: { embeddingModel: null, embeddedAt: null } });
  const resources = await Resource.find({ user: userId, 'processing.status': 'ready', 'processing.chunkCount': { $gt: 0 } }, { _id: 1 }).lean();
  await Resource.updateMany({ _id: { $in: resources.map((r) => r._id) } }, { $set: { 'embedding.status': 'pending', 'embedding.error': null } }, { timestamps: false });
  resources.forEach((r) => embeddingQueue.enqueue(r._id));
  return { queued: resources.length, model: provider.id };
}

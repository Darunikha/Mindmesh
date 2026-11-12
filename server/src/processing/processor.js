import Resource from '../models/Resource.js';
import Chunk from '../models/Chunk.js';
import { FILE_TYPES } from './fileTypes.js';
import { absolutePath } from './storage.js';
import { chunkSegments, excerptOf } from './chunker.js';
import { ExtractionError, extractFromFile } from './extractors.js';
import { FetchError, fetchLink } from './linkFetcher.js';
import { docToSegments } from './noteContent.js';
import env from '../config/env.js';
import { createQueue } from './queue.js';
import { NOTE_EMBED_DELAY_MS, hashText, scheduleEmbedding } from './embedder.js';
import { invalidateUserVectors } from '../ai/vectorCache.js';

export const MAX_CHUNKS_PER_RESOURCE = 3000;

export const processingQueue = createQueue({ name: 'processing', concurrency: env.PROCESSING_CONCURRENCY });
export const enqueue = (id) => processingQueue.enqueue(id);

/** Replaces a resource's chunks. If the resource was deleted meanwhile, cleans up instead. */
export async function writeChunks(resource, segments) {
  const all = chunkSegments(segments);
  // Bound the work (and embedding cost) a single enormous item can create.
  const chunks = all.slice(0, MAX_CHUNKS_PER_RESOURCE).map((c) => ({ ...c, textHash: hashText(c.text) }));
  const capped = all.length > chunks.length;
  // Keep vectors for passages whose text is unchanged, so edits don't re-embed the whole item.
  const previous = await Chunk.find({ resource: resource._id, embeddingModel: { $ne: null } }, { textHash: 1, embeddingModel: 1, embeddedAt: 1 })
    .select('+embedding')
    .lean();
  const reusable = new Map(previous.filter((p) => p.textHash && p.embedding?.length).map((p) => [p.textHash, p]));
  await Chunk.deleteMany({ resource: resource._id });
  if (chunks.length) {
    await Chunk.insertMany(
      chunks.map((c) => {
        const prev = reusable.get(c.textHash);
        return {
          ...c,
          user: resource.user,
          resource: resource._id,
          resourceType: resource.type,
          ...(prev ? { embedding: prev.embedding, embeddingModel: prev.embeddingModel, embeddedAt: prev.embeddedAt } : {}),
        };
      }),
      { ordered: true }
    );
  }
  invalidateUserVectors(resource.user);
  if (!(await Resource.exists({ _id: resource._id }))) {
    await Chunk.deleteMany({ resource: resource._id });
    return null;
  }
  await Resource.updateOne(
    { _id: resource._id },
    { $set: { 'processing.note': capped ? `This item is very long; only the first ${MAX_CHUNKS_PER_RESOURCE.toLocaleString()} of ${all.length.toLocaleString()} passages were indexed.` : null } },
    { timestamps: false }
  );
  await scheduleEmbedding(resource._id, { delay: resource.type === 'note' ? NOTE_EMBED_DELAY_MS : 0 });
  return { chunkCount: chunks.length, charCount: chunks.reduce((n, c) => n + c.charCount, 0), excerpt: excerptOf(segments) };
}

/** Notes are small, so they are chunked synchronously on every save. */
export async function indexNote(resource) {
  const segments = docToSegments(resource.note?.content);
  const result = await writeChunks(resource, segments);
  if (!result) return;
  await Resource.updateOne(
    { _id: resource._id },
    {
      $set: {
        excerpt: result.excerpt,
        'processing.status': 'ready',
        'processing.chunkCount': result.chunkCount,
        'processing.charCount': result.charCount,
        'processing.completedAt': new Date(),
        'processing.error': null,
        'processing.code': null,
      },
    },
    { timestamps: false }
  );
}

async function fail(id, err) {
  const known = err instanceof ExtractionError || err instanceof FetchError;
  if (!known) console.error(`[mindmesh] Unexpected processing error for ${id}:`, err);
  await Resource.updateOne(
    { _id: id },
    {
      $set: {
        'processing.status': 'failed',
        'processing.error': known ? err.message : 'Something went wrong while processing this item. You can try again.',
        'processing.code': known ? err.code : 'INTERNAL',
        'processing.completedAt': new Date(),
      },
    },
    { timestamps: false }
  );
}

/** Background job: extract → chunk → store → mark ready/failed. Never throws. */
export async function processResource(id) {
  const resource = await Resource.findOneAndUpdate(
    { _id: id, 'processing.status': { $in: ['pending', 'processing'] } },
    { $set: { 'processing.status': 'processing', 'processing.startedAt': new Date(), 'processing.error': null, 'processing.code': null }, $inc: { 'processing.attempts': 1 } },
    { returnDocument: 'after', timestamps: false }
  );
  if (!resource) return; // deleted, or already handled

  try {
    let segments;
    const updates = {};

    if (resource.type === 'document') {
      const spec = FILE_TYPES[resource.file.extension];
      if (!spec) throw new ExtractionError('This file type is not supported.', 'UNSUPPORTED');
      const out = await extractFromFile(absolutePath(resource.file.storageKey), spec.extractor);
      segments = out.segments;
      if (out.pageCount) updates['file.pageCount'] = out.pageCount;
    } else if (resource.type === 'link') {
      // Failures (unreachable, blocked, robots-disallowed) mark the link failed, but the bookmark itself is kept.
      const out = await fetchLink(resource.link.url);
      segments = out.segments;
      updates['link.finalUrl'] = out.finalUrl;
      updates['link.domain'] = new URL(out.finalUrl).hostname.replace(/^www\./, '');
      const m = out.metadata;
      if (m.description) updates['link.description'] = m.description;
      if (m.siteName) updates['link.siteName'] = m.siteName;
      if (m.faviconUrl) updates['link.faviconUrl'] = m.faviconUrl;
      if (m.imageUrl) updates['link.imageUrl'] = m.imageUrl;
      if (m.title && !resource.link.customTitle) updates.title = m.title;
      if (out.pageCount) updates['file.pageCount'] = out.pageCount;
      // Save metadata even if the page turns out to have no readable text.
      if (Object.keys(updates).length) await Resource.updateOne({ _id: id }, { $set: updates }, { timestamps: false });
    } else {
      return indexNote(resource);
    }

    const result = await writeChunks(resource, segments);
    if (!result) return; // resource deleted mid-processing
    if (result.chunkCount === 0) {
      throw new ExtractionError(
        resource.type === 'document' && resource.file.extension === '.pdf'
          ? 'No readable text was found. This PDF may contain scanned images, which need OCR (not yet supported).'
          : 'No readable text was found in this item.',
        'NO_TEXT'
      );
    }

    await Resource.updateOne(
      { _id: id },
      {
        $set: {
          ...updates,
          excerpt: result.excerpt,
          'processing.status': 'ready',
          'processing.chunkCount': result.chunkCount,
          'processing.charCount': result.charCount,
          'processing.completedAt': new Date(),
        },
      },
      { timestamps: false }
    );
  } catch (err) {
    await fail(id, err);
  }
}

/** Re-queues work interrupted by a restart. Call once at boot. */
export async function recoverStuckJobs() {
  const stuck = await Resource.find({ 'processing.status': { $in: ['pending', 'processing'] } }, { _id: 1 }).lean();
  if (stuck.length) {
    await Resource.updateMany({ _id: { $in: stuck.map((s) => s._id) } }, { $set: { 'processing.status': 'pending' } }, { timestamps: false });
    stuck.forEach((s) => enqueue(s._id));
    console.log(`[mindmesh] Re-queued ${stuck.length} interrupted processing job(s).`);
  }
}

processingQueue.setHandler(processResource);

import mongoose from 'mongoose';
import Resource from '../../models/Resource.js';
import Chunk from '../../models/Chunk.js';
import Tag from '../../models/Tag.js';
import Collection from '../../models/Collection.js';
import Connection from '../../models/Connection.js';
import Activity from '../../models/Activity.js';
import SearchHistory from '../../models/SearchHistory.js';
import GraphLayout from '../../models/GraphLayout.js';
import Message from '../../models/Message.js';
import { invalidateUserVectors } from '../../ai/vectorCache.js';
import ApiError from '../../utils/ApiError.js';
import { FILE_TYPES, titleFromFilename } from '../../processing/fileTypes.js';
import { moveIntoStorage, removeFile, removeUserFiles, openStream, fileExists } from '../../processing/storage.js';
import { EMPTY_DOC, NoteContentError, countWords, docToSegments, sanitizeDoc } from '../../processing/noteContent.js';
import { FetchError, validatePublicUrl } from '../../processing/linkFetcher.js';
import { enqueue, indexNote } from '../../processing/processor.js';
import { assertCollectionOwned } from '../collections/collections.service.js';
import { logActivity } from '../timeline/activity.js';
import { search as runSearch } from '../search/search.service.js';
import { deleteAllForUser as deleteFlashcardsForUser, detachResource as detachFlashcards } from '../flashcards/flashcards.service.js';
import { deleteAllForUser as deleteQuizzesForUser, detachResource as detachQuizzes } from '../quiz/quiz.service.js';

const OPEN_LOG_INTERVAL_MS = 30 * 60 * 1000;
import { resolveTagNames, serializeTag } from '../tags/tags.service.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// ── Serialisation ───────────────────────────────────────────────────────

export function serializeResource(r, { withContent = false } = {}) {
  const tags = (r.tags || []).filter((t) => t && t.name).map(serializeTag);
  const base = {
    id: r._id.toString(),
    type: r.type,
    title: r.title,
    excerpt: r.excerpt || '',
    pinned: Boolean(r.pinned),
    collectionId: r.collectionId ? String(r.collectionId._id || r.collectionId) : null,
    tags,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastAccessedAt: r.lastAccessedAt,
    processing: {
      status: r.processing?.status || 'ready',
      error: r.processing?.error || null,
      code: r.processing?.code || null,
      chunkCount: r.processing?.chunkCount || 0,
      charCount: r.processing?.charCount || 0,
      completedAt: r.processing?.completedAt || null,
      note: r.processing?.note || null,
    },
    semanticIndex: {
      status: r.embedding?.status || 'none',
      model: r.embedding?.model || null,
      error: r.embedding?.error || null,
      embeddedChunks: r.embedding?.embeddedChunks || 0,
    },
  };
  if (r.type === 'note') {
    base.note = { wordCount: r.note?.wordCount || 0, revision: r.note?.revision || 0 };
    if (withContent) base.note.content = r.note?.content || EMPTY_DOC;
  }
  if (r.type === 'document') {
    const spec = FILE_TYPES[r.file?.extension];
    base.file = {
      originalName: r.file?.originalName,
      extension: r.file?.extension,
      label: spec?.label || 'File',
      size: r.file?.size,
      pageCount: r.file?.pageCount ?? null,
    };
  }
  if (r.type === 'link') {
    base.link = {
      url: r.link?.url,
      finalUrl: r.link?.finalUrl || null,
      domain: r.link?.domain,
      description: r.link?.description || '',
      siteName: r.link?.siteName || '',
      faviconUrl: r.link?.faviconUrl || '',
      imageUrl: r.link?.imageUrl || '',
      pageCount: r.file?.pageCount ?? null,
    };
  }
  return base;
}

const TAG_POPULATE = { path: 'tags', select: 'name color', options: { sort: { nameLower: 1 } } };

async function findOwned(userId, id) {
  const r = await Resource.findOne({ _id: id, user: userId });
  if (!r) throw ApiError.notFound('This item does not exist or you do not have access to it');
  return r;
}

async function hydrate(id, opts) {
  const r = await Resource.findById(id).populate(TAG_POPULATE).lean();
  return serializeResource(r, opts);
}

// ── Listing and search ──────────────────────────────────────────────────

const SORTS = {
  updated: { updatedAt: -1, _id: -1 },
  created: { createdAt: -1, _id: -1 },
  title: { title: 1, _id: 1 },
  accessed: { lastAccessedAt: -1, updatedAt: -1 },
};

function buildFilter(userId, q) {
  const filter = { user: oid(userId) };
  if (q.type) filter.type = q.type;
  if (q.collection) filter.collectionId = q.collection === 'none' ? null : oid(q.collection);
  if (q.tags?.length) filter.tags = { $all: q.tags.map(oid) };
  if (q.pinned !== undefined) filter.pinned = q.pinned;
  if (q.status) filter['processing.status'] = q.status;
  return filter;
}

/**
 * The vault's search box uses the same ranking as Smart Search (titles, full text and,
 * when configured, meaning), adapted to the vault's list shape and filters.
 */
async function search(userId, q) {
  const res = await runSearch(userId, {
    q: q.q,
    mode: 'smart',
    type: q.type ? [q.type] : [],
    collection: q.collection,
    tags: q.tags,
    pinned: q.pinned,
    status: q.status,
    sort: q.sort || 'relevance',
    page: q.page,
    limit: q.limit,
  });
  return {
    total: res.total,
    items: res.items.map((i) => {
      const p = i.passages[0];
      return { ...i.resource, score: i.score, match: p ? { snippet: p.text, highlights: p.highlights, page: p.page, heading: p.heading } : null };
    }),
  };
}

export async function listResources(userId, q) {
  let result;
  if (q.q) {
    result = await search(userId, q);
  } else {
    const filter = buildFilter(userId, q);
    const sort = SORTS[q.sort && q.sort !== 'relevance' ? q.sort : 'updated'];
    const query = Resource.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate(TAG_POPULATE)
      .lean();
    if (q.sort === 'title') query.collation({ locale: 'en', strength: 2 });
    const [docs, total] = await Promise.all([query, Resource.countDocuments(filter)]);
    result = { items: docs.map((d) => serializeResource(d)), total };
  }
  return { ...result, page: q.page, limit: q.limit, hasMore: q.page * q.limit < result.total };
}

export async function overview(userId) {
  const user = oid(userId);
  const [counts, pinned, recentlyAccessed, recentlyAdded, processing] = await Promise.all([
    Resource.aggregate([{ $match: { user } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    Resource.find({ user, pinned: true }).sort({ updatedAt: -1 }).limit(8).populate(TAG_POPULATE).lean(),
    Resource.find({ user, lastAccessedAt: { $ne: null } }).sort({ lastAccessedAt: -1 }).limit(6).populate(TAG_POPULATE).lean(),
    Resource.find({ user }).sort({ createdAt: -1 }).limit(6).populate(TAG_POPULATE).lean(),
    Resource.countDocuments({ user, 'processing.status': { $in: ['pending', 'processing'] } }),
  ]);
  const byType = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  return {
    counts: { note: byType.note || 0, document: byType.document || 0, link: byType.link || 0, total: counts.reduce((n, c) => n + c.count, 0), processing },
    pinned: pinned.map((d) => serializeResource(d)),
    recentlyAccessed: recentlyAccessed.map((d) => serializeResource(d)),
    recentlyAdded: recentlyAdded.map((d) => serializeResource(d)),
  };
}

// ── Single resource ─────────────────────────────────────────────────────

/** Fetches one item and records the access (drives "recently accessed"). */
export async function getResource(userId, id, { touch = true } = {}) {
  const now = new Date();
  const r = await Resource.findOneAndUpdate(
    { _id: id, user: userId },
    touch ? { $set: { lastAccessedAt: now } } : {},
    { returnDocument: 'before', timestamps: false }
  )
    .populate(TAG_POPULATE)
    .lean();
  if (!r) throw ApiError.notFound('This item does not exist or you do not have access to it');
  // Log "opened" on the timeline at most once per 30 minutes per item.
  if (touch && (!r.lastAccessedAt || now - new Date(r.lastAccessedAt) > OPEN_LOG_INTERVAL_MS)) {
    logActivity(userId, 'resource_opened', { resource: r._id, title: r.title, meta: { resourceType: r.type } });
  }
  return serializeResource(touch ? { ...r, lastAccessedAt: now } : r, { withContent: true });
}

export async function getChunks(userId, id, { page, limit }) {
  await findOwned(userId, id);
  const [chunks, total] = await Promise.all([
    Chunk.find({ resource: id, user: userId })
      .sort({ index: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Chunk.countDocuments({ resource: id, user: userId }),
  ]);
  return {
    chunks: chunks.map((c) => ({ index: c.index, text: c.text, page: c.page, pageEnd: c.pageEnd, heading: c.heading, charCount: c.charCount, tokenEstimate: c.tokenEstimate })),
    total,
    page,
    hasMore: page * limit < total,
  };
}

async function resolveOrganisation(userId, { collectionId, tags }) {
  const out = {};
  if (collectionId !== undefined) {
    await assertCollectionOwned(userId, collectionId);
    out.collectionId = collectionId || null;
  }
  if (tags !== undefined) out.tags = await resolveTagNames(userId, tags);
  return out;
}

function prepareNoteContent(content) {
  try {
    const clean = sanitizeDoc(content);
    const segments = docToSegments(clean);
    return { clean, wordCount: countWords(segments) };
  } catch (err) {
    if (err instanceof NoteContentError) throw ApiError.badRequest(err.message, { fields: { content: err.message } });
    throw err;
  }
}

export async function createNote(userId, body) {
  const org = await resolveOrganisation(userId, body);
  const { clean, wordCount } = prepareNoteContent(body.content || EMPTY_DOC);
  const r = await Resource.create({
    user: userId,
    type: 'note',
    title: body.title || 'Untitled note',
    pinned: Boolean(body.pinned),
    ...org,
    note: { content: clean, wordCount, revision: 1 },
    lastAccessedAt: new Date(),
    processing: { status: 'ready' },
  });
  await indexNote(r);
  logActivity(userId, 'note_created', { resource: r._id, title: r.title, meta: { resourceType: 'note' } });
  return hydrate(r._id, { withContent: true });
}

export async function updateResource(userId, id, body) {
  const r = await findOwned(userId, id);
  const org = await resolveOrganisation(userId, body);
  const $set = { ...org };
  if (body.title !== undefined) {
    $set.title = body.title;
    if (r.type === 'link') $set['link.customTitle'] = true;
  }
  if (body.pinned !== undefined) $set.pinned = body.pinned;

  let contentChanged = false;
  const filter = { _id: r._id, user: userId };
  const update = { $set };

  if (body.content !== undefined) {
    if (r.type !== 'note') throw ApiError.badRequest('Only notes have editable content');
    // Optimistic concurrency: reject saves based on a stale revision (e.g. the note is open in two tabs).
    if (body.baseRevision !== (r.note?.revision || 0)) {
      throw ApiError.conflict('This note was changed somewhere else. Reload to get the latest version.', 'NOTE_CONFLICT');
    }
    const { clean, wordCount } = prepareNoteContent(body.content);
    $set['note.content'] = clean;
    $set['note.wordCount'] = wordCount;
    update.$inc = { 'note.revision': 1 };
    filter['note.revision'] = body.baseRevision;
    contentChanged = true;
  }

  // Pin/organisation changes don't count as edits to the item itself.
  const onlyOrganisation = !contentChanged && body.title === undefined;
  const updated = await Resource.findOneAndUpdate(filter, update, { returnDocument: 'after', timestamps: !onlyOrganisation });
  if (!updated) throw ApiError.conflict('This note was changed somewhere else. Reload to get the latest version.', 'NOTE_CONFLICT');
  if (contentChanged || (r.type === 'note' && body.title !== undefined)) await indexNote(updated);
  return hydrate(updated._id, { withContent: r.type === 'note' });
}

export async function createDocument(userId, upload, fields) {
  let storageKey;
  try {
    const org = await resolveOrganisation(userId, fields);
    storageKey = await moveIntoStorage(upload.tmpPath, userId, upload.extension);
    const spec = FILE_TYPES[upload.extension];
    const r = await Resource.create({
      user: userId,
      type: 'document',
      title: fields.title || titleFromFilename(upload.originalName),
      ...org,
      file: {
        storageKey,
        originalName: upload.originalName,
        extension: upload.extension,
        mimeType: spec.mimes[0],
        size: upload.size,
      },
      processing: { status: 'pending' },
    });
    enqueue(r._id);
    logActivity(userId, 'document_uploaded', { resource: r._id, title: r.title, meta: { resourceType: 'document', extension: upload.extension } });
    return hydrate(r._id);
  } catch (err) {
    if (storageKey) await removeFile(storageKey);
    else await removeFile(upload.tmpPath, { isKey: false });
    throw err;
  }
}

export async function createLink(userId, body) {
  let url;
  try {
    // Add https:// only when no scheme was typed, so "ftp://…" is rejected rather than rewritten.
    url = validatePublicUrl(/^[a-z][a-z\d+.-]*:\/\//i.test(body.url) ? body.url : `https://${body.url}`);
  } catch (err) {
    if (err instanceof FetchError) throw ApiError.badRequest(err.message, { fields: { url: err.message } });
    throw err;
  }
  const org = await resolveOrganisation(userId, body);
  const existing = await Resource.findOne({ user: userId, type: 'link', 'link.url': url.toString() }, { _id: 1, title: 1 }).lean();
  if (existing) throw ApiError.conflict(`You already saved this link as "${existing.title}"`, 'LINK_EXISTS');

  const r = await Resource.create({
    user: userId,
    type: 'link',
    title: body.title || url.hostname.replace(/^www\./, ''),
    ...org,
    link: { url: url.toString(), domain: url.hostname.replace(/^www\./, ''), customTitle: Boolean(body.title) },
    processing: { status: 'pending' },
  });
  enqueue(r._id);
  logActivity(userId, 'link_saved', { resource: r._id, title: r.title, meta: { resourceType: 'link', domain: r.link.domain } });
  return hydrate(r._id);
}

export async function reprocess(userId, id) {
  const r = await findOwned(userId, id);
  if (r.type === 'note') throw ApiError.badRequest('Notes are indexed automatically when saved');
  if (['pending', 'processing'].includes(r.processing?.status)) throw ApiError.conflict('This item is already being processed', 'ALREADY_PROCESSING');
  await Resource.updateOne({ _id: r._id }, { $set: { 'processing.status': 'pending', 'processing.error': null, 'processing.code': null } }, { timestamps: false });
  enqueue(r._id);
  return hydrate(r._id);
}

export async function deleteResource(userId, id) {
  const r = await Resource.findOneAndDelete({ _id: id, user: userId });
  if (!r) throw ApiError.notFound('This item does not exist or you do not have access to it');
  await Chunk.deleteMany({ resource: r._id });
  await Connection.deleteMany({ user: userId, $or: [{ a: r._id }, { b: r._id }] });
  await GraphLayout.updateOne({ user: userId }, { $unset: { [`positions.r:${r._id}`]: 1 } });
  // Past answers keep their quoted excerpt, but no longer link to an item that is gone.
  await Message.updateMany(
    { user: userId, 'citations.resourceId': r._id },
    { $set: { 'citations.$[c].resourceDeleted': true } },
    { arrayFilters: [{ 'c.resourceId': r._id }] }
  );
  invalidateUserVectors(userId);
  await detachFlashcards(userId, r._id);
  await detachQuizzes(userId, r._id);
  if (r.file?.storageKey) await removeFile(r.file.storageKey);
}

export async function bulk(userId, { ids, action, collectionId, tags }) {
  const filter = { user: oid(userId), _id: { $in: ids.map(oid) } };
  if (action === 'delete') {
    const docs = await Resource.find(filter, { _id: 1 }).lean();
    for (const d of docs) await deleteResource(userId, d._id);
    return { affected: docs.length };
  }
  let update;
  if (action === 'pin' || action === 'unpin') update = { $set: { pinned: action === 'pin' } };
  if (action === 'move') {
    await assertCollectionOwned(userId, collectionId);
    update = { $set: { collectionId: collectionId || null } };
  }
  if (action === 'addTags') update = { $addToSet: { tags: { $each: await resolveTagNames(userId, tags) } } };
  const res = await Resource.updateMany(filter, update, { timestamps: false });
  return { affected: res.modifiedCount };
}

// ── Files ───────────────────────────────────────────────────────────────

/** Safe response types: never serve user files as HTML from the API origin. */
const SERVE_AS = {
  '.pdf': { type: 'application/pdf', inline: true },
  '.docx': { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
};

export async function openFile(userId, id) {
  const r = await findOwned(userId, id);
  if (r.type !== 'document' || !r.file?.storageKey) throw ApiError.notFound('This item has no file');
  if (!(await fileExists(r.file.storageKey))) throw ApiError.notFound('The stored file is missing');
  const serve = SERVE_AS[r.file.extension] || { type: 'text/plain; charset=utf-8', inline: true };
  return { stream: openStream(r.file.storageKey), size: r.file.size, filename: r.file.originalName, ...serve };
}

// ── Account cleanup ─────────────────────────────────────────────────────

export async function deleteAllForUser(userId) {
  await Promise.all([
    Resource.deleteMany({ user: userId }),
    Chunk.deleteMany({ user: userId }),
    Collection.deleteMany({ user: userId }),
    Tag.deleteMany({ user: userId }),
    Connection.deleteMany({ user: userId }),
    Activity.deleteMany({ user: userId }),
    SearchHistory.deleteMany({ user: userId }),
    GraphLayout.deleteMany({ user: userId }),
    deleteFlashcardsForUser(userId),
    deleteQuizzesForUser(userId),
  ]);
  invalidateUserVectors(userId);
  await removeUserFiles(userId);
}

import mongoose from 'mongoose';
import Resource from '../../models/Resource.js';
import Chunk from '../../models/Chunk.js';
import Tag from '../../models/Tag.js';
import Collection from '../../models/Collection.js';
import ApiError from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/validators.js';
import { FILE_TYPES, titleFromFilename } from '../../processing/fileTypes.js';
import { moveIntoStorage, removeFile, removeUserFiles, openStream, fileExists } from '../../processing/storage.js';
import { EMPTY_DOC, NoteContentError, countWords, docToSegments, sanitizeDoc } from '../../processing/noteContent.js';
import { FetchError, validatePublicUrl } from '../../processing/linkFetcher.js';
import { indexNote } from '../../processing/processor.js';
import { enqueue } from '../../processing/queue.js';
import { assertCollectionOwned } from '../collections/collections.service.js';
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

/** Builds a short snippet around the first matching query term. */
function snippetFor(text, terms, size = 220) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    pos = lower.indexOf(t);
    if (pos !== -1) break;
  }
  const start = Math.max(0, pos === -1 ? 0 : pos - 70);
  const slice = text.slice(start, start + size).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${start + size < text.length ? '…' : ''}`;
}

/**
 * Keyword search across titles, descriptions and the full extracted text of every item.
 * Combines MongoDB text-index scores from resources (title-weighted) and chunks (content),
 * plus a case-insensitive title prefix match so partial words still find things.
 * Semantic (embedding) search arrives in Phase 4 on top of the same chunks.
 */
async function search(userId, q) {
  const user = oid(userId);
  const terms = q.q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const scores = new Map();
  const matches = new Map();
  const bump = (id, s) => scores.set(String(id), (scores.get(String(id)) || 0) + s);

  const [resHits, chunkHits, titleHits] = await Promise.all([
    Resource.find({ user, $text: { $search: q.q } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(300)
      .lean(),
    Chunk.aggregate([
      { $match: { $text: { $search: q.q }, user } },
      { $project: { resource: 1, text: 1, page: 1, heading: 1, score: { $meta: 'textScore' } } },
      { $sort: { score: -1 } },
      { $limit: 600 },
      { $group: { _id: '$resource', score: { $max: '$score' }, hits: { $sum: 1 }, best: { $first: '$$ROOT' } } },
    ]),
    Resource.find({ user, title: { $regex: escapeRegex(q.q.slice(0, 100)), $options: 'i' } }, { _id: 1 })
      .limit(200)
      .lean(),
  ]);

  for (const r of resHits) bump(r._id, r.score * 1.5);
  for (const c of chunkHits) {
    bump(c._id, c.score + Math.log2(1 + c.hits) * 0.25);
    matches.set(String(c._id), { snippet: snippetFor(c.best.text, terms), page: c.best.page, heading: c.best.heading });
  }
  for (const r of titleHits) bump(r._id, 1);

  const ids = [...scores.keys()].map(oid);
  if (!ids.length) return { items: [], total: 0 };

  const filter = { ...buildFilter(userId, q), _id: { $in: ids } };
  let docs = await Resource.find(filter).populate(TAG_POPULATE).lean();

  const sort = q.sort || 'relevance';
  if (sort === 'relevance') docs.sort((a, b) => scores.get(String(b._id)) - scores.get(String(a._id)));
  else if (sort === 'title') docs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  else {
    const key = { updated: 'updatedAt', created: 'createdAt', accessed: 'lastAccessedAt' }[sort];
    docs.sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
  }

  const total = docs.length;
  docs = docs.slice((q.page - 1) * q.limit, q.page * q.limit);
  return {
    total,
    items: docs.map((d) => ({ ...serializeResource(d), match: matches.get(String(d._id)) || null, score: Number(scores.get(String(d._id)).toFixed(3)) })),
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
  const r = await Resource.findOneAndUpdate(
    { _id: id, user: userId },
    touch ? { $set: { lastAccessedAt: new Date() } } : {},
    { returnDocument: 'after', timestamps: false }
  )
    .populate(TAG_POPULATE)
    .lean();
  if (!r) throw ApiError.notFound('This item does not exist or you do not have access to it');
  return serializeResource(r, { withContent: true });
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
  ]);
  await removeUserFiles(userId);
}

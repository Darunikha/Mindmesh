import { z } from 'zod';
import { RESOURCE_TYPES } from '../../models/Resource.js';
import { nullableObjectId, objectId, tagNames } from '../../utils/validators.js';

const title = z.string().trim().min(1, 'Title cannot be empty').max(300, 'Keep titles under 300 characters');
const docContent = z.object({ type: z.literal('doc') }).passthrough();

export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  collection: z.union([objectId, z.literal('none')]).optional(),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(objectId).max(10)),
  pinned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
  sort: z.enum(['relevance', 'updated', 'created', 'title', 'accessed']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export const createNoteSchema = z
  .object({
    title: title.optional(),
    content: docContent.optional(),
    collectionId: nullableObjectId.optional(),
    tags: tagNames.optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

export const createLinkSchema = z
  .object({
    url: z.string().trim().min(1, 'Paste a link').max(2048, 'That link is too long'),
    title: title.optional(),
    collectionId: nullableObjectId.optional(),
    tags: tagNames.optional(),
  })
  .strict();

export const updateResourceSchema = z
  .object({
    title: title.optional(),
    content: docContent.optional(),
    /** The note revision the client edited from; required when content is sent. */
    baseRevision: z.number().int().min(0).optional(),
    pinned: z.boolean().optional(),
    collectionId: nullableObjectId.optional(),
    tags: tagNames.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'baseRevision'), 'Nothing to update')
  .refine((v) => v.content === undefined || v.baseRevision !== undefined, { message: 'baseRevision is required with content', path: ['baseRevision'] });

/** Multipart fields that accompany an upload. Tags arrive as a JSON array string. */
export const uploadFieldsSchema = z.object({
  title: title.optional(),
  collectionId: nullableObjectId.optional(),
  tags: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return [];
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr : [];
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Tags must be a JSON array' });
        return z.NEVER;
      }
    })
    .pipe(tagNames),
});

export const chunkQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const bulkSchema = z
  .object({
    ids: z.array(objectId).min(1).max(100),
    action: z.enum(['move', 'pin', 'unpin', 'delete', 'addTags']),
    collectionId: nullableObjectId.optional(),
    tags: tagNames.optional(),
  })
  .strict()
  .refine((v) => v.action !== 'move' || v.collectionId !== undefined, { message: 'Choose a collection', path: ['collectionId'] })
  .refine((v) => v.action !== 'addTags' || (v.tags && v.tags.length), { message: 'Choose at least one tag', path: ['tags'] });

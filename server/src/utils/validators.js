import { z } from 'zod';
import mongoose from 'mongoose';

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');

export const objectIdParams = z.object({ id: objectId });

/** Accepts an id, or null / "none" / "" meaning "no collection". */
export const nullableObjectId = z
  .union([objectId, z.literal('none'), z.literal(''), z.null()])
  .transform((v) => (v === 'none' || v === '' ? null : v));

export const tagNames = z.array(z.string().trim().min(1).max(40)).max(20, 'Use up to 20 tags');

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** YYYY-MM-DD or a full ISO timestamp. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/, 'Use a date like 2026-01-31')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

/** Expands a bare end date (YYYY-MM-DD) to the end of that day. */
export const endOfDay = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.999Z` : v);

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

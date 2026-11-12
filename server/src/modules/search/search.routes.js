import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { endOfDay, isoDate, objectId, objectIdParams } from '../../utils/validators.js';
import { RESOURCE_TYPES } from '../../models/Resource.js';
import * as service from './search.service.js';

const router = Router();
router.use(requireAuth);

const csv = (inner) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(inner).max(10));

const searchQuery = z
  .object({
    q: z.string().trim().min(1, 'Type something to search for').max(200),
    mode: z.enum(['smart', 'keyword', 'semantic']).default('smart'),
    type: csv(z.enum(RESOURCE_TYPES)),
    collection: z.union([objectId, z.literal('none')]).optional(),
    tags: csv(objectId),
    from: isoDate.optional(),
    to: isoDate.optional(),
    sort: z.enum(['relevance', 'newest', 'oldest']).default('relevance'),
    page: z.coerce.number().int().min(1).max(100).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    record: z.enum(['true', 'false']).optional(),
  })
  .refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to), { message: 'The start date must be before the end date', path: ['from'] });

router.get('/', validate({ query: searchQuery }), async (req, res) => {
  const p = req.validatedQuery;
  // A bare date for "to" means the whole day.
  p.to = endOfDay(p.to);
  const result = await service.search(req.user._id, p);
  if (p.record === 'true' && p.page === 1) await service.recordSearch(req.user._id, p.q, result.total);
  res.json(result);
});

router.get('/suggest', validate({ query: z.object({ q: z.string().trim().min(1).max(60) }) }), async (req, res) =>
  res.json(await service.suggest(req.user._id, req.validatedQuery.q))
);
router.get('/recent', async (req, res) => res.json({ searches: await service.recentSearches(req.user._id) }));
/** Remembers a query the user settled on (the client calls this instead of re-running the search). */
router.post(
  '/recent',
  validate({ body: z.object({ query: z.string().trim().min(2).max(200), resultCount: z.number().int().min(0).max(100000).default(0) }).strict() }),
  async (req, res) => {
    await service.recordSearch(req.user._id, req.body.query, req.body.resultCount);
    res.status(204).end();
  }
);
router.delete('/recent', async (req, res) => {
  await service.deleteRecent(req.user._id);
  res.status(204).end();
});
router.delete('/recent/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.deleteRecent(req.user._id, req.params.id);
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import env from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { objectId, objectIdParams } from '../../utils/validators.js';
import { GRADES } from './scheduler.js';
import * as service from './flashcards.service.js';

const router = Router();
router.use(requireAuth);

/** Card generation calls the AI model; keep it to a sensible per-user pace. */
const generateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id),
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({ error: { message: 'You are generating cards very quickly. Please wait a few minutes.', code: 'RATE_LIMITED' } }),
});

const front = z.string().trim().min(1, 'Write a question or prompt').max(1000);
const back = z.string().trim().min(1, 'Write the answer').max(4000);

router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(100).optional(),
      resourceId: objectId.optional(),
      status: z.enum(['all', 'due', 'new', 'suspended']).default('all'),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  async (req, res) => res.json(await service.list(req.user._id, req.validatedQuery))
);
router.get('/stats', async (req, res) => res.json(await service.stats(req.user._id)));
router.get(
  '/due',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), resourceId: objectId.optional() }) }),
  async (req, res) => res.json(await service.due(req.user._id, req.validatedQuery))
);
router.post('/', validate({ body: z.object({ front, back, resourceId: objectId.nullable().optional() }).strict() }), async (req, res) =>
  res.status(201).json({ card: await service.create(req.user._id, req.body) })
);
router.post(
  '/generate',
  generateLimiter,
  validate({ body: z.object({ resourceId: objectId, count: z.number().int().min(1).max(15).default(8) }).strict() }),
  async (req, res) => res.status(201).json(await service.generate(req.user._id, req.body))
);
router.patch(
  '/:id',
  validate({
    params: objectIdParams,
    body: z
      .object({ front: front.optional(), back: back.optional(), suspended: z.boolean().optional() })
      .strict()
      .refine((v) => Object.keys(v).length, 'Nothing to update'),
  }),
  async (req, res) => res.json({ card: await service.update(req.user._id, req.params.id, req.body) })
);
router.post('/:id/review', validate({ params: objectIdParams, body: z.object({ grade: z.enum(GRADES) }).strict() }), async (req, res) =>
  res.json({ card: await service.review(req.user._id, req.params.id, req.body.grade) })
);
router.delete('/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.remove(req.user._id, req.params.id);
  res.status(204).end();
});

export default router;

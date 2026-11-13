import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import env from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { objectId, objectIdParams } from '../../utils/validators.js';
import * as service from './quiz.service.js';

const router = Router();
router.use(requireAuth);

/** Starting and grading both call the AI model. */
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id),
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({ error: { message: 'You are going very fast. Please wait a few minutes.', code: 'RATE_LIMITED' } }),
});

const scope = z
  .object({ type: z.enum(['all', 'collection', 'resource']), id: objectId.optional() })
  .refine((s) => s.type === 'all' || s.id, { message: 'Choose what to be quizzed on', path: ['id'] });

router.get('/', async (req, res) => res.json({ quizzes: await service.list(req.user._id) }));
router.post('/', aiLimiter, validate({ body: z.object({ scope, count: z.number().int().min(3).max(12).default(6) }).strict() }), async (req, res) =>
  res.status(201).json({ quiz: await service.start(req.user._id, req.body) })
);
router.get('/:id', validate({ params: objectIdParams }), async (req, res) => res.json({ quiz: await service.get(req.user._id, req.params.id) }));
router.post(
  '/:id/answer',
  aiLimiter,
  validate({ params: objectIdParams, body: z.object({ index: z.number().int().min(0).max(50), answer: z.string().trim().min(1, 'Write an answer first').max(2000, 'Keep answers under 2,000 characters') }).strict() }),
  async (req, res) => res.json({ quiz: await service.answer(req.user._id, req.params.id, req.body) })
);
router.post('/:id/flashcards', validate({ params: objectIdParams }), async (req, res) => res.json(await service.makeFlashcards(req.user._id, req.params.id)));
router.delete('/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.remove(req.user._id, req.params.id);
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { objectId, objectIdParams } from '../../utils/validators.js';
import { RESOURCE_TYPES } from '../../models/Resource.js';
import * as service from './graph.service.js';

const router = Router();
router.use(requireAuth);

const flag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const graphQuery = z.object({
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(RESOURCE_TYPES))),
  collection: z.union([objectId, z.literal('none')]).optional(),
  tag: objectId.optional(),
  showTopics: flag,
  showCollections: flag,
});

const nodeId = z.string().regex(/^[rtc]:[a-f\d]{24}$/i, 'Invalid node id');
const layoutSchema = z.object({
  positions: z
    .record(nodeId, z.object({ x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6) }))
    .refine((p) => Object.keys(p).length <= 1000, 'Too many positions'),
});

router.get('/', validate({ query: graphQuery }), async (req, res) => res.json(await service.getGraph(req.user._id, req.validatedQuery)));

router.post(
  '/connections',
  validate({ body: z.object({ sourceId: objectId, targetId: objectId, label: z.string().trim().max(60).optional() }).strict() }),
  async (req, res) => res.status(201).json({ connection: await service.createConnection(req.user._id, req.body) })
);
router.patch('/connections/:id', validate({ params: objectIdParams, body: z.object({ label: z.string().trim().max(60) }).strict() }), async (req, res) =>
  res.json({ connection: await service.updateConnection(req.user._id, req.params.id, req.body) })
);
router.delete('/connections/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.deleteConnection(req.user._id, req.params.id);
  res.status(204).end();
});

router.get('/suggestions', async (req, res) => res.json({ suggestions: await service.listSuggestions(req.user._id) }));
router.post('/suggestions/generate', sensitiveLimiter, validate({ body: z.object({ limit: z.number().int().min(1).max(20).optional() }).strict() }), async (req, res) =>
  res.json(await service.generateSuggestions(req.user._id, req.body))
);
router.post('/suggestions/:id/accept', validate({ params: objectIdParams }), async (req, res) => res.json({ connection: await service.decideSuggestion(req.user._id, req.params.id, true) }));
router.post('/suggestions/:id/dismiss', validate({ params: objectIdParams }), async (req, res) => res.json({ connection: await service.decideSuggestion(req.user._id, req.params.id, false) }));

router.get('/related/:id', validate({ params: objectIdParams }), async (req, res) => res.json(await service.related(req.user._id, req.params.id)));

router.put('/layout', validate({ body: layoutSchema }), async (req, res) => {
  await service.saveLayout(req.user._id, req.body.positions);
  res.status(204).end();
});
router.delete('/layout', async (req, res) => {
  await service.resetLayout(req.user._id);
  res.status(204).end();
});

export default router;

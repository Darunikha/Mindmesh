import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { TAG_COLORS } from '../../models/Tag.js';
import { objectIdParams } from '../../utils/validators.js';
import * as service from './tags.service.js';

const router = Router();
router.use(requireAuth);

const name = z.string().trim().min(1, 'Tag name cannot be empty').max(40, 'Keep tag names under 40 characters');
const createSchema = z.object({ name, color: z.enum(TAG_COLORS).optional() }).strict();
const updateSchema = z
  .object({ name: name.optional(), color: z.enum(TAG_COLORS).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

router.get('/', async (req, res) => res.json({ tags: await service.listTags(req.user._id) }));
router.post('/', validate({ body: createSchema }), async (req, res) => res.status(201).json({ tag: await service.createTag(req.user._id, req.body) }));
router.patch('/:id', validate({ params: objectIdParams, body: updateSchema }), async (req, res) =>
  res.json({ tag: await service.updateTag(req.user._id, req.params.id, req.body) })
);
router.delete('/:id', validate({ params: objectIdParams }), async (req, res) => res.json(await service.deleteTag(req.user._id, req.params.id)));

export default router;

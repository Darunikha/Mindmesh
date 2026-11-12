import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { COLLECTION_COLORS } from '../../models/Collection.js';
import { nullableObjectId, objectIdParams } from '../../utils/validators.js';
import * as service from './collections.service.js';

const router = Router();
router.use(requireAuth);

const name = z.string().trim().min(1, 'Give the collection a name').max(80, 'Keep names under 80 characters');
const description = z.string().trim().max(280, 'Keep descriptions under 280 characters');

const createSchema = z
  .object({ name, description: description.optional(), color: z.enum(COLLECTION_COLORS).optional(), parentId: nullableObjectId.optional() })
  .strict();
const updateSchema = z
  .object({ name: name.optional(), description: description.optional(), color: z.enum(COLLECTION_COLORS).optional(), parentId: nullableObjectId.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const deleteQuery = z.object({ moveTo: nullableObjectId.optional() });

router.get('/', async (req, res) => res.json(await service.listCollections(req.user._id)));
router.post('/', validate({ body: createSchema }), async (req, res) =>
  res.status(201).json({ collection: await service.createCollection(req.user._id, req.body) })
);
router.patch('/:id', validate({ params: objectIdParams, body: updateSchema }), async (req, res) =>
  res.json({ collection: await service.updateCollection(req.user._id, req.params.id, req.body) })
);
router.delete('/:id', validate({ params: objectIdParams, query: deleteQuery }), async (req, res) =>
  res.json(await service.deleteCollection(req.user._id, req.params.id, { moveTo: req.validatedQuery.moveTo }))
);

export default router;

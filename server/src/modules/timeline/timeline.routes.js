import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ACTIVITY_TYPES } from '../../models/Activity.js';
import { endOfDay, isoDate } from '../../utils/validators.js';
import * as service from './timeline.service.js';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(ACTIVITY_TYPES))),
  from: isoDate.optional(),
  to: isoDate.optional(),
  before: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const summaryQuery = z.object({
  days: z.coerce.number().int().min(7).max(366).default(84),
  tz: z
    .string()
    .max(64)
    .default('UTC')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone'),
});

router.get('/', validate({ query: listQuery }), async (req, res) => {
  await service.ensureBackfilled(req.user);
  const q = req.validatedQuery;
  q.to = endOfDay(q.to);
  res.json(await service.listActivity(req.user._id, q));
});

router.get('/summary', validate({ query: summaryQuery }), async (req, res) => {
  await service.ensureBackfilled(req.user);
  res.json(await service.summary(req.user._id, req.validatedQuery));
});

export default router;

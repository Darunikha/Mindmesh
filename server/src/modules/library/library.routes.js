import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import env from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { objectIdParams } from '../../utils/validators.js';
import { receiveUpload } from './upload.middleware.js';
import * as v from './library.validators.js';
import * as service from './library.service.js';

const router = Router();
router.use(requireAuth);

/** Uploads and link fetches cost disk and outbound requests, so they get their own per-user budget. */
const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id),
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({ error: { message: 'You are adding items too quickly. Please wait a few minutes.', code: 'RATE_LIMITED' } }),
});

router.get('/', validate({ query: v.listQuery }), async (req, res) => res.json(await service.listResources(req.user._id, req.validatedQuery)));
router.get('/overview', async (req, res) => res.json(await service.overview(req.user._id)));

router.post('/notes', validate({ body: v.createNoteSchema }), async (req, res) =>
  res.status(201).json({ resource: await service.createNote(req.user._id, req.body) })
);
router.post('/links', ingestLimiter, validate({ body: v.createLinkSchema }), async (req, res) =>
  res.status(202).json({ resource: await service.createLink(req.user._id, req.body) })
);
router.post('/documents', ingestLimiter, receiveUpload, validate({ body: v.uploadFieldsSchema }), async (req, res) =>
  res.status(202).json({ resource: await service.createDocument(req.user._id, req.upload, req.body) })
);
router.post('/bulk', validate({ body: v.bulkSchema }), async (req, res) => res.json(await service.bulk(req.user._id, req.body)));

router.get('/:id', validate({ params: objectIdParams }), async (req, res) =>
  res.json({ resource: await service.getResource(req.user._id, req.params.id, { touch: req.query.touch !== 'false' }) })
);
router.get('/:id/chunks', validate({ params: objectIdParams, query: v.chunkQuery }), async (req, res) =>
  res.json(await service.getChunks(req.user._id, req.params.id, req.validatedQuery))
);
router.get('/:id/file', validate({ params: objectIdParams }), async (req, res) => {
  const file = await service.openFile(req.user._id, req.params.id);
  const encoded = encodeURIComponent(file.filename).replace(/['()]/g, escape);
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.set({
    'Content-Type': file.type,
    'Content-Length': String(file.size),
    'Content-Disposition': `${file.inline && req.query.download !== '1' ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  });
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
});
router.patch('/:id', validate({ params: objectIdParams, body: v.updateResourceSchema }), async (req, res) =>
  res.json({ resource: await service.updateResource(req.user._id, req.params.id, req.body) })
);
router.post('/:id/reprocess', validate({ params: objectIdParams }), async (req, res) =>
  res.status(202).json({ resource: await service.reprocess(req.user._id, req.params.id) })
);
router.delete('/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.deleteResource(req.user._id, req.params.id);
  res.status(204).end();
});

export default router;

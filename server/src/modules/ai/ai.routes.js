import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import ApiError from '../../utils/ApiError.js';
import Resource from '../../models/Resource.js';
import { getEmbeddingProvider, providerStatus } from '../../ai/providers.js';
import { vectorSearchMode } from '../../ai/vectorSearch.js';
import { countIndexed } from '../../ai/retrieval.js';
import { reindexUser } from '../../processing/embedder.js';

const router = Router();
router.use(requireAuth);

/** What's configured, and how much of this user's library is semantically indexed. No secrets. */
router.get('/status', async (req, res) => {
  const status = providerStatus();
  const counts = await Resource.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(req.user._id)) } },
    { $group: { _id: '$embedding.status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id || 'none', c.count]));
  res.json({
    ...status,
    vectorSearch: vectorSearchMode(),
    index: { ...(await countIndexed(req.user._id)), byStatus },
  });
});

router.post('/reindex', sensitiveLimiter, validate({ body: z.object({ force: z.boolean().optional() }).strict() }), async (req, res) => {
  try {
    getEmbeddingProvider();
  } catch (err) {
    throw new ApiError(503, 'Semantic indexing is not configured on this server.', 'EMBEDDINGS_NOT_CONFIGURED', { reason: err.message });
  }
  res.status(202).json(await reindexUser(req.user._id, { force: Boolean(req.body.force) }));
});

export default router;

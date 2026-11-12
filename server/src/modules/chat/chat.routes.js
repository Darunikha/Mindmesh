import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import env from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { objectId, objectIdParams } from '../../utils/validators.js';
import ApiError from '../../utils/ApiError.js';
import Message from '../../models/Message.js';
import { CHAT_MODES } from '../../models/Conversation.js';
import { getChatProvider } from '../../ai/providers.js';
import * as service from './chat.service.js';
import { runGeneration } from './generation.js';
import { logActivity } from '../timeline/activity.js';

const router = Router();
router.use(requireAuth);

/** Each message costs real model tokens; keep a generous per-user ceiling. */
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id),
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({ error: { message: 'You are sending messages very quickly. Please wait a moment.', code: 'RATE_LIMITED' } }),
});

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});
const createSchema = z.object({ title: z.string().trim().min(1).max(120).optional(), mode: z.enum(CHAT_MODES).optional() }).strict();
const updateSchema = z
  .object({ title: z.string().trim().min(1, 'Title cannot be empty').max(120).optional(), mode: z.enum(CHAT_MODES).optional() })
  .strict()
  .refine((v) => Object.keys(v).length, 'Nothing to update');
const sendSchema = z
  .object({
    content: z.string().trim().min(1, 'Type a message').max(12000, 'Messages can be up to 12,000 characters'),
    mode: z.enum(CHAT_MODES),
    clientRequestId: z.string().min(8).max(64).regex(/^[\w-]+$/),
  })
  .strict();
const regenSchema = z.object({ mode: z.enum(CHAT_MODES).optional() }).strict();
const msgParams = z.object({ id: objectId, messageId: objectId });

function chatProviderOrThrow() {
  try {
    return getChatProvider();
  } catch (err) {
    throw new ApiError(503, 'The AI assistant is not configured on this server yet.', 'AI_NOT_CONFIGURED', { reason: err.message });
  }
}

router.get('/', validate({ query: listQuery }), async (req, res) => res.json(await service.listConversations(req.user._id, req.validatedQuery)));
router.post('/', validate({ body: createSchema }), async (req, res) => res.status(201).json({ conversation: await service.createConversation(req.user._id, req.body) }));
router.get('/:id', validate({ params: objectIdParams }), async (req, res) => res.json(await service.getConversation(req.user._id, req.params.id)));
router.patch('/:id', validate({ params: objectIdParams, body: updateSchema }), async (req, res) =>
  res.json({ conversation: await service.updateConversation(req.user._id, req.params.id, req.body) })
);
router.delete('/:id', validate({ params: objectIdParams }), async (req, res) => {
  await service.deleteConversation(req.user._id, req.params.id);
  res.status(204).end();
});

/** Sends a message and streams the answer (text/event-stream). */
router.post('/:id/messages', generationLimiter, validate({ params: objectIdParams, body: sendSchema }), async (req, res) => {
  const provider = chatProviderOrThrow();
  const { content, mode, clientRequestId } = req.body;
  await service.findOwnedConversation(req.user._id, req.params.id);

  const existing = await Message.findOne({ conversation: req.params.id, clientRequestId }, { _id: 1 }).lean();
  if (existing) throw ApiError.conflict('This message was already sent.', 'DUPLICATE_REQUEST');

  const conversation = await service.acquireLock(req.user._id, req.params.id);
  try {
    let userMessage;
    try {
      userMessage = await Message.create({ conversation: conversation._id, user: req.user._id, role: 'user', mode, content, clientRequestId });
    } catch (err) {
      if (err?.code === 11000) throw ApiError.conflict('This message was already sent.', 'DUPLICATE_REQUEST');
      throw err;
    }
    // The first question of a conversation is a "topic explored" on the timeline.
    if (conversation.messageCount === 0) {
      logActivity(req.user._id, 'conversation_started', { conversation: conversation._id, title: content.slice(0, 140), meta: { mode } });
    }
    await runGeneration({ req, res, provider, conversation, userMessage, mode, user: req.user, isNewTurn: true });
  } finally {
    await service.releaseLock(conversation._id);
  }
});

/** Replaces the latest assistant answer with a new one (optionally in another mode). */
router.post('/:id/messages/:messageId/regenerate', generationLimiter, validate({ params: msgParams, body: regenSchema }), async (req, res) => {
  const provider = chatProviderOrThrow();
  const conversation = await service.acquireLock(req.user._id, req.params.id);
  try {
    const last = await Message.findOne({ conversation: conversation._id, user: req.user._id }).sort({ createdAt: -1, _id: -1 });
    if (!last || String(last._id) !== req.params.messageId || last.role !== 'assistant') {
      throw ApiError.badRequest('Only the most recent answer can be regenerated.');
    }
    const userMessage = await Message.findOne({ conversation: conversation._id, role: 'user', createdAt: { $lte: last.createdAt } }).sort({ createdAt: -1, _id: -1 });
    if (!userMessage) throw ApiError.badRequest('There is no question to answer again.');
    await last.deleteOne();
    const mode = req.body.mode || last.mode;
    await runGeneration({ req, res, provider, conversation, userMessage, mode, user: req.user, isNewTurn: false });
  } finally {
    await service.releaseLock(conversation._id);
  }
});

export default router;

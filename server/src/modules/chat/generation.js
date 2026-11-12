import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import Resource from '../../models/Resource.js';
import { retrieve } from '../../ai/retrieval.js';
import { FOLLOWUP_SCHEMA, SUMMARY_SCHEMA, citedNumbers, followUpPrompt, knowledgeTurn, summaryPrompt, systemPrompt } from '../../ai/prompts.js';
import { serializeConversation, serializeMessage } from './chat.service.js';

/** Characters of prior conversation sent verbatim (~12k tokens). Older turns are summarised. */
const HISTORY_CHAR_BUDGET = 48000;
const EMPTY_LIBRARY_NOTICE =
  "Your Knowledge Vault is empty, so there are no personal sources to search yet.\n\nAdd notes, documents or links in the **Knowledge Vault**, and My Knowledge mode will answer from them with citations. Or switch to **General AI** to get an answer from the model's general knowledge.";

function sse(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  return (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

/**
 * Builds the prior-turn history for the model: as many recent messages as fit the budget,
 * preceded by a rolling summary of anything older. The summary is updated (one small model
 * call) only when new messages fall out of the window.
 */
async function buildHistory(provider, conversation, beforeMessage) {
  const prior = await Message.find({
    conversation: conversation._id,
    kind: 'message',
    status: { $in: ['complete', 'stopped'] },
    content: { $ne: '' },
    createdAt: { $lte: beforeMessage.createdAt },
    _id: { $ne: beforeMessage._id },
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  let used = 0;
  let cut = prior.length;
  for (let i = prior.length - 1; i >= 0; i--) {
    used += prior[i].content.length;
    if (used > HISTORY_CHAR_BUDGET) break;
    cut = i;
  }
  let kept = prior.slice(cut);
  const overflow = prior.slice(0, cut);

  let summary = conversation.summary;
  const unsummarised = overflow.filter((m) => !conversation.summaryThrough || m.createdAt > conversation.summaryThrough);
  if (unsummarised.length) {
    try {
      const transcript = unsummarised.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 4000)}`).join('\n\n');
      const out = await provider.completeJson({ system: 'You maintain concise conversation summaries.', prompt: summaryPrompt(summary, transcript), schema: SUMMARY_SCHEMA, maxTokens: 1500 });
      if (out?.summary) {
        summary = out.summary;
        await Conversation.updateOne({ _id: conversation._id }, { $set: { summary, summaryThrough: unsummarised.at(-1).createdAt } }, { timestamps: false });
      }
    } catch {
      /* Summary is best-effort; the recent window still carries context. */
    }
  }

  // The first message sent to the model must be from the user.
  while (kept.length && kept[0].role !== 'user') kept = kept.slice(1);
  const history = kept.map((m) => ({ role: m.role, content: m.content }));
  if (summary && overflow.length) {
    history.unshift({ role: 'user', content: `<conversation_summary>\nSummary of earlier messages in this conversation (they are no longer shown in full):\n${summary}\n</conversation_summary>` });
  }
  return history;
}

/** Short follow-ups ("and the second one?") retrieve poorly alone; include the previous question. */
async function retrievalQuery(conversationId, userMessage) {
  const words = userMessage.content.trim().split(/\s+/).length;
  if (words >= 8) return userMessage.content;
  const prev = await Message.findOne({ conversation: conversationId, role: 'user', createdAt: { $lt: userMessage.createdAt } }).sort({ createdAt: -1 }).lean();
  return prev ? `${prev.content}\n${userMessage.content}` : userMessage.content;
}

/**
 * Runs one assistant turn and streams it to the client as Server-Sent Events:
 *   start → status(searching) → sources → status(thinking) → delta* → done → meta(followUps/title) → end
 * Errors after streaming starts are sent as an `error` event and recorded on the message.
 */
export async function runGeneration({ req, res, provider, conversation, userMessage, mode, user, isNewTurn }) {
  const send = sse(res);
  const assistant = await Message.create({ conversation: conversation._id, user: user._id, role: 'assistant', mode, status: 'streaming' });
  send('start', { userMessage: serializeMessage(userMessage), assistantMessage: serializeMessage(assistant) });

  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });

  let text = '';
  let passages = [];
  try {
    const prefs = user.preferences?.ai || {};
    const update = {};

    if (mode === 'knowledge') {
      const libraryCount = await Resource.countDocuments({ user: user._id });
      if (libraryCount === 0) {
        Object.assign(update, { kind: 'notice', content: EMPTY_LIBRARY_NOTICE, status: 'complete', retrieval: { searched: false, found: 0, note: 'EMPTY_LIBRARY' } });
        await Message.updateOne({ _id: assistant._id }, { $set: update });
        await finishConversation(conversation, mode, isNewTurn);
        send('done', { message: serializeMessage({ ...assistant.toObject(), ...update }) });
        return;
      }
      send('status', { phase: 'searching' });
      const query = await retrievalQuery(conversation._id, userMessage);
      const r = await retrieve(user._id, query);
      passages = r.passages;
      update.retrieval = {
        searched: true,
        strategy: r.strategy,
        found: passages.length,
        note: r.semanticError ? `Semantic search was unavailable (${r.semanticError}); keyword search was used.` : r.strategy === 'keyword' ? 'Semantic search is not configured; keyword search was used.' : null,
      };
      send('sources', {
        retrieval: update.retrieval,
        passages: passages.map((p) => ({ n: p.n, resourceId: p.resourceId, resourceType: p.resourceType, title: p.title, page: p.page, excerpt: p.text.slice(0, 400) })),
      });
    }

    send('status', { phase: 'thinking' });
    const history = await buildHistory(provider, conversation, userMessage);
    const messages = [...history, { role: 'user', content: mode === 'knowledge' ? knowledgeTurn(userMessage.content, passages) : userMessage.content }];

    let lastSave = Date.now();
    const result = await provider.streamChat({
      system: systemPrompt({ mode, style: prefs.responseStyle }),
      messages,
      signal: controller.signal,
      onText: (delta) => {
        text += delta;
        send('delta', { text: delta });
        if (Date.now() - lastSave > 1500) {
          lastSave = Date.now();
          Message.updateOne({ _id: assistant._id }, { $set: { content: text } }).catch(() => {});
        }
      },
    });

    const content = result.text || text;
    const cited = citedNumbers(content);
    Object.assign(update, {
      content: content || (result.stopReason === 'refusal' ? 'The model declined to answer this request.' : ''),
      status: result.stopReason === 'refusal' ? 'refused' : 'complete',
      truncated: result.stopReason === 'max_tokens',
      model: result.model,
      usage: result.usage,
      // Only passages that were actually retrieved can become citations; `cited` marks those the answer used.
      citations: passages.map((p) => ({
        n: p.n,
        chunkId: p.chunkId,
        resourceId: p.resourceId,
        resourceType: p.resourceType,
        title: p.title,
        excerpt: p.text.slice(0, 700),
        page: p.page,
        pageEnd: p.pageEnd,
        heading: p.heading,
        similarity: p.similarity,
        matchedBy: p.matchedBy,
        cited: cited.has(p.n),
      })),
    });
    await Message.updateOne({ _id: assistant._id }, { $set: update });
    const convo = await finishConversation(conversation, mode, isNewTurn);
    send('done', { message: serializeMessage({ ...assistant.toObject(), ...update }) });

    // Follow-up suggestions and an automatic title (best-effort, after the answer is delivered).
    const wantTitle = !convo.titleLocked && convo.title === 'New conversation';
    const wantFollowUps = prefs.showFollowUps !== false && update.status === 'complete';
    if ((wantTitle || wantFollowUps) && !controller.signal.aborted) {
      try {
        const meta = await provider.completeJson({ system: 'You write concise titles and follow-up questions.', prompt: followUpPrompt(userMessage.content, update.content), schema: FOLLOWUP_SCHEMA, maxTokens: 600 });
        if (meta) {
          const followUps = wantFollowUps ? (meta.followUps || []).filter((f) => typeof f === 'string' && f.trim()).slice(0, 3).map((f) => f.trim().slice(0, 140)) : [];
          if (followUps.length) await Message.updateOne({ _id: assistant._id }, { $set: { followUps } });
          let titled = null;
          if (wantTitle && meta.title?.trim()) {
            titled = await Conversation.findOneAndUpdate(
              { _id: conversation._id, titleLocked: false },
              { $set: { title: meta.title.trim().replace(/^["']|["']$/g, '').slice(0, 80) } },
              { returnDocument: 'after', timestamps: false }
            );
          }
          send('meta', { messageId: String(assistant._id), followUps, conversation: titled ? serializeConversation(titled) : null });
        }
      } catch {
        /* Suggestions are optional. */
      }
    }
  } catch (err) {
    const aborted = controller.signal.aborted || err.code === 'ABORTED';
    const fields = aborted
      ? { status: 'stopped', content: text, error: null }
      : { status: 'error', content: text, error: err.message || 'Something went wrong while generating the answer.', errorCode: err.code || 'AI_ERROR' };
    if (passages.length && aborted) {
      const cited = citedNumbers(text);
      fields.citations = passages.map((p) => ({ n: p.n, chunkId: p.chunkId, resourceId: p.resourceId, resourceType: p.resourceType, title: p.title, excerpt: p.text.slice(0, 700), page: p.page, pageEnd: p.pageEnd, heading: p.heading, similarity: p.similarity, matchedBy: p.matchedBy, cited: cited.has(p.n) }));
    }
    await Message.updateOne({ _id: assistant._id }, { $set: fields });
    await finishConversation(conversation, mode, isNewTurn);
    if (!aborted) {
      if (err.code === undefined) console.error('[mindmesh] Generation failed:', err);
      send('error', { messageId: String(assistant._id), message: fields.error, code: fields.errorCode });
    }
  } finally {
    finished = true;
    send('end', {});
    res.end();
  }
}

async function finishConversation(conversation, mode, isNewTurn) {
  return Conversation.findOneAndUpdate(
    { _id: conversation._id },
    { $set: { lastMessageAt: new Date(), mode }, ...(isNewTurn ? { $inc: { messageCount: 2 } } : {}) },
    { returnDocument: 'after' }
  );
}

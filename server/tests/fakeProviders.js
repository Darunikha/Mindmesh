/**
 * Test doubles for the AI providers. They are registered only inside the test process;
 * the application itself never ships or falls back to them.
 */
import { normalize } from '../src/ai/embeddings.js';
import { registerChatProvider, registerEmbeddingProvider, resetProviders } from '../src/ai/index.js';
import env from '../src/config/env.js';

export const calls = { chat: [], json: [], embed: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

registerChatProvider('fake', () => ({
  name: 'fake',
  model: 'fake-model',
  async streamChat({ system, messages, signal, onText }) {
    calls.chat.push({ system, messages });
    const last = messages.at(-1).content;
    if (last.includes('EXPLODE')) {
      onText('Partial ');
      throw Object.assign(new Error('The AI provider is temporarily unavailable. Please try again.'), { code: 'AI_UNAVAILABLE' });
    }
    const slow = last.includes('SLOW');
    const answer = last.includes('<sources>')
      ? last.includes('No passages')
        ? "Your saved sources don't cover this.\n\n**From general knowledge:** here is some context."
        : 'Your notes say gradients flow backwards [1]. Also see [9].\n\n**From general knowledge:** backprop uses the chain rule.'
      : `Echo: ${last.slice(0, 60)}`;
    const parts = answer.match(/.{1,8}/gs);
    let text = '';
    for (const p of slow ? [...parts, ...parts, ...parts] : parts) {
      if (signal?.aborted) throw Object.assign(new Error('Generation was stopped.'), { code: 'ABORTED' });
      if (slow) await sleep(60);
      text += p;
      onText(p);
    }
    return { text, stopReason: 'end_turn', model: 'fake-model', usage: { inputTokens: 10, outputTokens: 20 } };
  },
  async completeJson({ prompt }) {
    calls.json.push(prompt);
    if (prompt.includes('running summary')) return { summary: 'Earlier the user discussed topic X.' };
    if (prompt.includes('flashcards from this item')) {
      return {
        cards: [
          { front: 'What does backpropagation compute?', back: 'Gradients of the loss.' },
          { front: 'what does backpropagation compute?', back: 'Duplicate question.' },
          { front: 'Which rule does it rely on?', back: 'The chain rule.' },
        ],
      };
    }
    if (prompt.includes('numbered pair')) {
      const lines = prompt.split('\n');
      const n = lines.filter((l) => /^\d+\. A:/.test(l)).length;
      // Pairs whose text mentions UNRELATED are rejected, to test the review filter.
      return {
        pairs: Array.from({ length: n }, (_, index) => {
          const i = lines.findIndex((l) => l.startsWith(`${index}. A:`));
          const pairText = `${lines[i]} ${lines[i + 1] || ''}`;
          return { index, related: !pairText.includes('UNRELATED'), label: 'same topic', reason: 'Both cover the same idea.' };
        }),
      };
    }
    return { title: 'Fake Title', followUps: ['What next?', 'Tell me more?'] };
  },
}));

/** Words that mean related things share a concept token, so this double behaves "semantically". */
const CONCEPTS = {
  conceptml: ['learn', 'learns', 'learning', 'train', 'trains', 'training', 'example', 'examples', 'data', 'neural', 'network', 'networks', 'weights', 'computers'],
  conceptfood: ['bake', 'baking', 'bread', 'sourdough', 'flour', 'oven', 'recipe', 'starter'],
};
const conceptOf = new Map(Object.entries(CONCEPTS).flatMap(([c, words]) => words.map((w) => [w, c])));

/** Deterministic bag-of-words "embedding": shared words (or concepts) → similar vectors. */
function hashVector(text, dims = 64) {
  const v = new Array(dims).fill(0);
  for (const raw of text.toLowerCase().match(/[a-z]{3,}/g) || []) {
    const w = conceptOf.get(raw) || raw;
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % dims] += 1;
  }
  return normalize(v);
}

registerEmbeddingProvider('fake', () => ({
  name: 'fake',
  model: 'fake-embed',
  dimensions: 64,
  id: 'fake:fake-embed:64',
  async embed(texts, { inputType } = {}) {
    calls.embed.push({ count: texts.length, inputType, texts });
    return texts.map((t) => hashVector(t));
  },
}));

export function useFakeProviders({ chat = true, embeddings = true } = {}) {
  env.AI_PROVIDER = chat ? 'fake' : 'none';
  env.EMBEDDING_PROVIDER = embeddings ? 'fake' : 'none';
  resetProviders();
  calls.chat.length = 0;
  calls.json.length = 0;
  calls.embed.length = 0;
}

/** Parses a text/event-stream body into [{ event, data }]. */
export function parseSse(body) {
  return body
    .split('\n\n')
    .filter((b) => b.trim())
    .map((block) => {
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

export const sseParser = (res, cb) => {
  let d = '';
  res.setEncoding('utf8');
  res.on('data', (c) => (d += c));
  res.on('end', () => cb(null, d));
};

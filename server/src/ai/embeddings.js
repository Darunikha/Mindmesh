import { registerEmbeddingProvider } from './providers.js';

/**
 * Embedding adapters. Vectors are L2-normalised before storage so cosine similarity
 * is a plain dot product, both in Atlas and in the local fallback.
 */

export class EmbeddingError extends Error {
  constructor(message, code = 'EMBEDDING_FAILED', retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum) || 1;
  return vec.map((v) => v / n);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST JSON with retries on 429/5xx and network errors. */
async function postJson(url, body, headers, label) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      lastErr = new EmbeddingError(`Could not reach ${label}.`, 'EMBEDDING_UNREACHABLE', true);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    const detail = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new EmbeddingError(`${label} rejected the API key.`, 'EMBEDDING_AUTH');
    if (res.status === 429 || res.status >= 500) {
      lastErr = new EmbeddingError(`${label} is busy or rate-limiting (HTTP ${res.status}).`, 'EMBEDDING_RATE_LIMITED', true);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new EmbeddingError(`${label} returned HTTP ${res.status}: ${detail.slice(0, 200)}`, 'EMBEDDING_BAD_REQUEST');
  }
  throw lastErr;
}

async function inBatches(texts, size, fn) {
  const out = [];
  for (let i = 0; i < texts.length; i += size) out.push(...(await fn(texts.slice(i, i + size))));
  return out;
}

registerEmbeddingProvider('voyage', (env) => {
  if (!env.VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY is not set on the server');
  const model = env.EMBEDDING_MODEL || 'voyage-3.5';
  const dimensions = env.EMBEDDING_DIMENSIONS || 1024;
  return {
    name: 'voyage',
    model,
    dimensions,
    id: `voyage:${model}:${dimensions}`,
    embed: (texts, { inputType = 'document' } = {}) =>
      inBatches(texts, 64, async (batch) => {
        const data = await postJson(
          'https://api.voyageai.com/v1/embeddings',
          { input: batch, model, input_type: inputType, output_dimension: dimensions },
          { authorization: `Bearer ${env.VOYAGE_API_KEY}` },
          'Voyage AI'
        );
        return data.data.sort((a, b) => a.index - b.index).map((d) => normalize(d.embedding));
      }),
  };
});

registerEmbeddingProvider('openai', (env) => {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set on the server');
  const model = env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const dimensions = env.EMBEDDING_DIMENSIONS || 1536;
  return {
    name: 'openai',
    model,
    dimensions,
    id: `openai:${model}:${dimensions}`,
    embed: (texts) =>
      inBatches(texts, 128, async (batch) => {
        const data = await postJson(
          'https://api.openai.com/v1/embeddings',
          { input: batch, model, dimensions },
          { authorization: `Bearer ${env.OPENAI_API_KEY}` },
          'OpenAI'
        );
        return data.data.sort((a, b) => a.index - b.index).map((d) => normalize(d.embedding));
      }),
  };
});

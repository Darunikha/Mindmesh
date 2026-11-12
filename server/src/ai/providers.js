import env from '../config/env.js';

/**
 * Provider registry. Chat and embedding providers are looked up by name from the
 * environment (AI_PROVIDER / EMBEDDING_PROVIDER), so adding a provider means writing an
 * adapter with the same shape and registering it - callers never import a vendor SDK.
 *
 * Chat provider shape:
 *   { name, model,
 *     streamChat({ system, messages, signal, onText }) -> { text, stopReason, usage, model },
 *     completeJson({ system, prompt, schema, maxTokens }) -> object }
 *
 * Embedding provider shape:
 *   { name, model, dimensions, id, embed(texts, { inputType: 'document'|'query' }) -> number[][] }
 */

const chatFactories = new Map();
const embeddingFactories = new Map();
const cache = { chat: new Map(), embed: new Map() };

export function registerChatProvider(name, factory) {
  chatFactories.set(name, factory);
  cache.chat.delete(name);
}

export function registerEmbeddingProvider(name, factory) {
  embeddingFactories.set(name, factory);
  cache.embed.delete(name);
}

/** Error raised when a feature needs a provider that isn't configured. */
export class ProviderNotConfiguredError extends Error {
  constructor(kind, reason) {
    super(reason);
    this.kind = kind;
    this.code = kind === 'chat' ? 'AI_NOT_CONFIGURED' : 'EMBEDDINGS_NOT_CONFIGURED';
  }
}

function resolve(kind, name, factories, store) {
  const factory = factories.get(name);
  if (!factory) return { provider: null, reason: name === 'none' ? `${kind} provider is turned off` : `Unknown ${kind} provider "${name}"` };
  if (!store.has(name)) {
    try {
      store.set(name, { provider: factory(env), reason: null });
    } catch (err) {
      store.set(name, { provider: null, reason: err.message });
    }
  }
  return store.get(name);
}

export function getChatProvider({ required = true } = {}) {
  const { provider, reason } = resolve('chat', env.AI_PROVIDER, chatFactories, cache.chat);
  if (!provider && required) throw new ProviderNotConfiguredError('chat', reason);
  return provider;
}

export function getEmbeddingProvider({ required = true } = {}) {
  const { provider, reason } = resolve('embedding', env.EMBEDDING_PROVIDER, embeddingFactories, cache.embed);
  if (!provider && required) throw new ProviderNotConfiguredError('embedding', reason);
  return provider;
}

export function providerStatus() {
  const chat = resolve('chat', env.AI_PROVIDER, chatFactories, cache.chat);
  const embed = resolve('embedding', env.EMBEDDING_PROVIDER, embeddingFactories, cache.embed);
  return {
    chat: { configured: Boolean(chat.provider), provider: env.AI_PROVIDER, model: chat.provider?.model || null, reason: chat.reason },
    embeddings: {
      configured: Boolean(embed.provider),
      provider: env.EMBEDDING_PROVIDER,
      model: embed.provider?.model || null,
      dimensions: embed.provider?.dimensions || null,
      reason: embed.reason,
    },
  };
}

/** Clears cached provider instances (tests switch providers between cases). */
export function resetProviders() {
  cache.chat.clear();
  cache.embed.clear();
}

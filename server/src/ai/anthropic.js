import Anthropic from '@anthropic-ai/sdk';
import { registerChatProvider } from './providers.js';

/** Models that support Anthropic's server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_CAPABLE = /^claude-(opus-5|sonnet-5-5|fable-5|mythos-5)/;

export class ProviderError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Maps SDK errors to user-facing messages without leaking provider internals. */
export function describeAnthropicError(err) {
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError('Generation was stopped.', 'ABORTED', 499);
  if (err instanceof Anthropic.AuthenticationError) {
    return new ProviderError('The AI provider rejected the API key. Check ANTHROPIC_API_KEY on the server.', 'AI_AUTH', 503);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('This API key does not have access to the configured model.', 'AI_PERMISSION', 503);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ProviderError('The configured AI model was not found. Check AI_MODEL on the server.', 'AI_MODEL_NOT_FOUND', 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError('The AI provider is rate-limiting requests. Please wait a moment and try again.', 'AI_RATE_LIMITED', 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError('The AI provider could not process this request.', 'AI_BAD_REQUEST', 502);
  }
  if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && err.status >= 500)) {
    return new ProviderError('The AI provider is temporarily unavailable. Please try again.', 'AI_UNAVAILABLE', 503);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError('Could not reach the AI provider. Check the server’s internet connection.', 'AI_UNREACHABLE', 503);
  }
  return new ProviderError('The AI request failed unexpectedly.', 'AI_ERROR', 502);
}

function createAnthropicProvider(env) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the server');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const model = env.AI_MODEL;
  const utilityModel = env.AI_UTILITY_MODEL || env.AI_MODEL;
  const useFallbacks = env.AI_REFUSAL_FALLBACKS && FALLBACK_CAPABLE.test(model);

  return {
    name: 'anthropic',
    model,
    utilityModel,

    /** Streams a chat completion; calls onText for each text delta. */
    async streamChat({ system, messages, signal, onText }) {
      const params = {
        model,
        max_tokens: env.AI_MAX_OUTPUT_TOKENS,
        // The system prompt is stable per mode/style, so it caches well; auto-caching covers history.
        system: [{ type: 'text', text: system }],
        cache_control: { type: 'ephemeral' },
        output_config: { effort: env.AI_EFFORT },
        messages,
      };
      try {
        const stream = useFallbacks
          ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
          : client.messages.stream(params, { signal });
        stream.on('text', (delta) => onText?.(delta));
        const final = await stream.finalMessage();
        const text = final.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
        return {
          text,
          stopReason: final.stop_reason,
          refusalCategory: final.stop_reason === 'refusal' ? final.stop_details?.category || null : null,
          model: final.model,
          usage: { inputTokens: final.usage?.input_tokens || 0, outputTokens: final.usage?.output_tokens || 0, cacheReadTokens: final.usage?.cache_read_input_tokens || 0 },
        };
      } catch (err) {
        throw describeAnthropicError(err);
      }
    },

    /** Small structured-output call used for titles, follow-ups and summaries. */
    async completeJson({ system, prompt, schema, maxTokens = 2000 }) {
      try {
        const res = await client.messages.create({
          model: utilityModel,
          max_tokens: maxTokens,
          system,
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content: prompt }],
        });
        if (res.stop_reason === 'refusal') return null;
        const text = res.content.find((b) => b.type === 'text')?.text;
        return text ? JSON.parse(text) : null;
      } catch (err) {
        if (err instanceof SyntaxError) return null;
        throw describeAnthropicError(err);
      }
    },
  };
}

registerChatProvider('anthropic', createAnthropicProvider);

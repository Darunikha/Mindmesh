import { z } from 'zod';

/**
 * Centralised, validated environment configuration.
 * The process fails fast at boot if a required variable is missing or malformed,
 * so misconfiguration never surfaces as a confusing runtime error later.
 */
const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().optional(),
  USE_IN_MEMORY_DB: bool,

  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: bool,
  /** Requests per minute per IP across the whole API. */
  /** Serve the built React app from this server (single origin in production). */
  SERVE_CLIENT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CLIENT_DIST: z.string().default('../client/dist'),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(60).max(100000).default(1200),

  // Phase 2: knowledge library
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(200).default(25),
  PROCESSING_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  LINK_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  LINK_MAX_BYTES: z.coerce.number().int().min(10000).default(3000000),
  // Allows fetching localhost/private addresses. Development/testing only.
  ALLOW_PRIVATE_LINK_FETCH: bool,

  // Phase 3: AI assistant
  AI_PROVIDER: z.string().default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  /** Model for small helper tasks (titles, follow-ups, summaries). Defaults to AI_MODEL. */
  AI_UTILITY_MODEL: z.string().optional(),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(128000).default(16000),
  /** Server-side refusal fallbacks (Anthropic). Set to false to disable. */
  AI_REFUSAL_FALLBACKS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  EMBEDDING_PROVIDER: z.string().default('voyage'),
  VOYAGE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().optional(),

  /** auto: Atlas $vectorSearch when available, otherwise in-process similarity. */
  VECTOR_SEARCH: z.enum(['auto', 'atlas', 'local']).default('auto'),
  VECTOR_INDEX_NAME: z.string().default('chunk_embedding_index'),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(8),
  RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.3),

  // Phase 4: relationship suggestions (minimum similarity per method)
  GRAPH_SUGGEST_MIN_EMBEDDING: z.coerce.number().min(0).max(1).default(0.6),
  GRAPH_SUGGEST_MIN_KEYWORD: z.coerce.number().min(0).max(1).default(0.12),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(
    `\n[mindmesh] Invalid environment configuration:\n${details}\n\nCopy server/.env.example to server/.env and fill in the values.\n`
  );
  process.exit(1);
}

const env = parsed.data;

if (!env.MONGODB_URI && !env.USE_IN_MEMORY_DB && env.NODE_ENV !== 'test') {
  console.error('\n[mindmesh] Set MONGODB_URI, or USE_IN_MEMORY_DB=true for a throwaway local database.\n');
  process.exit(1);
}

if (env.NODE_ENV === 'production' && env.USE_IN_MEMORY_DB) {
  console.error('\n[mindmesh] USE_IN_MEMORY_DB cannot be used in production.\n');
  process.exit(1);
}

if (env.NODE_ENV === 'production' && env.ALLOW_PRIVATE_LINK_FETCH) {
  console.error('\n[mindmesh] ALLOW_PRIVATE_LINK_FETCH cannot be enabled in production.\n');
  process.exit(1);
}

export const isProd = env.NODE_ENV === 'production';
export default env;

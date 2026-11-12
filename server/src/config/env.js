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

export const isProd = env.NODE_ENV === 'production';
export default env;

/**
 * Production launcher: always runs in production mode and serves the built web app from
 * this server (single origin). A plain Node script instead of "VAR=value node ..." so it
 * works the same on Windows, macOS and Linux. Other settings still come from .env.
 *
 * Production mode is strict on purpose: it needs a real MONGODB_URI (the in-memory
 * development database is refused) and sends cookies as Secure, which browsers only keep
 * over HTTPS (or on localhost).
 */
process.env.NODE_ENV = 'production';
process.env.SERVE_CLIENT = 'true';
await import('../src/index.js');

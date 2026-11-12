// Must be imported before any application module so config/env.js sees these values.
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-0123456789';
process.env.BCRYPT_ROUNDS = '4';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `mindmesh-test-uploads-${process.pid}`);
process.env.MAX_UPLOAD_MB = '2';
process.env.LINK_FETCH_TIMEOUT_MS = '4000';
// Tests serve pages from a local HTTP server; individual tests switch this off to verify SSRF blocking.
process.env.ALLOW_PRIVATE_LINK_FETCH = 'true';

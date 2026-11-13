import './setup-env.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import env from '../src/config/env.js';
import { createApp } from '../src/app.js';

const INLINE = "document.documentElement.dataset.theme='lab';";
let dir;
let app;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-dist-'));
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html><html><head><script>${INLINE}</script></head><body><div id="root"></div></body></html>`);
  await fs.writeFile(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  env.SERVE_CLIENT = true;
  env.CLIENT_DIST = dir;
  app = createApp();
});

after(async () => {
  env.SERVE_CLIENT = false;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('serving the built client', () => {
  it('serves the app shell for client routes with a strict, hash-based CSP', async () => {
    const hash = crypto.createHash('sha256').update(INLINE).digest('base64');
    for (const p of ['/', '/vault/123', '/graph']) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.match(res.text, /id="root"/);
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes(`'sha256-${hash}'`), 'inline theme script is allowed by hash');
      assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'no unsafe-inline scripts');
      assert.match(csp, /frame-ancestors 'none'/);
      assert.equal(res.headers['cache-control'], 'no-cache');
    }
  });

  it('caches hashed assets for a long time and 404s missing ones cleanly', async () => {
    const asset = await request(app).get('/assets/app-abc123.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers['cache-control'], /immutable/);
    const missing = await request(app).get('/assets/nope.js');
    assert.equal(missing.status, 404);
  });

  it('keeps the API separate: unknown API paths are JSON 404s, not the app shell', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

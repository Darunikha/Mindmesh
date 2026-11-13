import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';

/**
 * Serves the built React app (client/dist) from the API server, so the whole product runs on
 * one origin in production: the SameSite=Strict refresh cookie works without a proxy setup.
 *
 * The page gets its own Content-Security-Policy. The only inline script (the pre-paint theme
 * snippet in index.html) is allowed by its exact SHA-256 hash rather than 'unsafe-inline'.
 */
export function mountClient(app, distDir) {
  const dist = path.resolve(distDir);
  const indexFile = path.join(dist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`SERVE_CLIENT is on but ${indexFile} was not found. Run "npm run build" first.`);
  }
  const html = fs.readFileSync(indexFile, 'utf8');
  const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);

  const csp = helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...scriptHashes],
      // Inline style attributes are used for layout values (React style props, motion).
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      // Saved links show favicons and preview images from the web; PDFs preview as blob: URLs.
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      frameSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  });

  // Hashed build assets never change, so they can be cached for a year.
  app.use(
    '/assets',
    csp,
    express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d', index: false, fallthrough: false })
  );
  app.use(csp, express.static(dist, { index: false, maxAge: '1h' }));

  // Client-side routes (/vault/123, /graph, …) all load the app shell.
  app.get(/^(?!\/api(\/|$)).*/, csp, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  });
}

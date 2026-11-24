import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Stamps dist/sw.js with an ID derived from the built index.html (which names every hashed asset).
 * A new build therefore changes the service worker file, which is what makes browsers install the
 * update and pre-cache the new app shell.
 */
function serviceWorkerBuildId() {
  let outDir;
  return {
    name: 'mindmesh-sw-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      try {
        const html = await fs.readFile(path.join(outDir, 'index.html'));
        const id = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
        const file = path.join(outDir, 'sw.js');
        await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replaceAll('__BUILD_ID__', id));
      } catch {
        /* no sw.js in the output: nothing to stamp */
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerBuildId()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    // Generous, so the suite stays green on a slow or busy machine (many test files run at once).
    testTimeout: 15000,
  },
  server: {
    port: 5173,
    // Same-origin API in development so the httpOnly refresh cookie just works.
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: true },
    },
  },
});

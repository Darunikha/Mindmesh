/*
 * Mindmesh service worker: makes the app installable and lets its shell open offline.
 *
 * WHAT IT CACHES (public files only, the same for every visitor):
 *   - the app shell (index.html)                     network first, cached copy if the network fails
 *   - /assets/*  (hashed JS, CSS, images)            cache first, they never change for a given URL
 *   - /icons/*                                       cache first
 *
 * WHAT IT NEVER TOUCHES:
 *   - /api/*  : your notes, chats and account data always go to the server and are never stored here
 *   - anything that is not a GET, anything on another origin (web fonts, link favicons), range requests
 *
 * Because no private data is ever cached, signing out leaves nothing behind in the cache.
 *
 * The BUILD placeholder below is replaced at build time (see vite.config.js), so every new build changes this file,
 * which is what makes browsers install the update and pre-cache the new shell.
 */
const BUILD = '__BUILD_ID__';
const ASSETS = 'mm-assets'; // keeps older builds' files too, so a tab that is still open can load its lazy chunks
const SHELL = 'mm-shell';
const SHELL_KEY = '/';
const MAX_ASSETS = 150;
const NAVIGATION_TIMEOUT_MS = 4000;

const isStatic = (path) => path.startsWith('/assets/') || path.startsWith('/icons/');

self.addEventListener('install', (event) => {
  // Fetch the shell and the files it needs right away, so the very first offline launch works.
  // A failure here must not block the install: the worker still works, it just caches lazily.
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(new Request(SHELL_KEY, { cache: 'reload' }));
        if (!res.ok) return;
        const html = await res.clone().text();
        await (await caches.open(SHELL)).put(SHELL_KEY, res);
        const cache = await caches.open(ASSETS);
        const urls = [...new Set([...html.matchAll(/(?:src|href)="(\/(?:assets|icons)\/[^"]+)"/g)].map((m) => m[1]))];
        await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
      } catch {
        /* offline while installing: fine */
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches from any other scheme this app used in the past.
      for (const name of await caches.keys()) if (name !== ASSETS && name !== SHELL) await caches.delete(name);
      await self.clients.claim();
    })()
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trim(cache);
  }
  return res;
}

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function openShell(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(SHELL_KEY, res.clone());
      return res;
    }
    // The server is up but failing: the cached shell shows the app's own "can't reach" screen instead of a bare error.
    if (res.status >= 500) return (await cache.match(SHELL_KEY)) || res;
    return res;
  } catch (err) {
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return; // private data: never cached

  if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(openShell(request));
  }
});

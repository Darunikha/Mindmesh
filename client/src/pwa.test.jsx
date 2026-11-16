import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useInstallPrompt, watchInstallPrompt } from './hooks/useInstallPrompt.js';

const PUBLIC = path.resolve(__dirname, '../public');
const read = (p) => fs.readFileSync(path.join(PUBLIC, p), 'utf8');

afterEach(cleanup);

describe('web app manifest', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));

  it('has what browsers need to offer installation', () => {
    expect(manifest.name).toBe('Mindmesh');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('points at icons that exist and really have the sizes it claims', () => {
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    expect(png.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const file = path.join(PUBLIC, icon.src);
      expect(fs.existsSync(file), icon.src).toBe(true);
      if (icon.type === 'image/png') {
        const buf = fs.readFileSync(file);
        expect(buf.subarray(1, 4).toString()).toBe('PNG');
        const [w, h] = icon.sizes.split('x').map(Number);
        expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([w, h]); // PNG header: width, height
      }
    }
  });

  it('shortcuts stay inside the app', () => {
    for (const s of manifest.shortcuts) expect(s.url.startsWith('/')).toBe(true);
  });

  it('is linked from the page along with an iOS icon', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('apple-touch-icon');
    const apple = fs.readFileSync(path.join(PUBLIC, 'icons/apple-touch-icon.png'));
    expect(apple.readUInt32BE(16)).toBe(180);
  });
});

/** Runs public/sw.js against a small fake of the browser's service-worker environment. */
function loadWorker({ fetchImpl }) {
  const handlers = {};
  const store = new Map(); // cache name -> Map(url -> Response)
  const cacheApi = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    const key = (r) => (typeof r === 'string' ? new URL(r, 'https://app.test').href : r.url);
    return {
      match: async (r) => m.get(key(r))?.clone(),
      put: async (r, res) => void m.set(key(r), res),
      add: async (r) => {
        const res = await fetchImpl(new Request(key(r)));
        if (!res.ok) throw new Error('bad');
        m.set(key(r), res);
      },
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      delete: async (r) => m.delete(key(r)),
    };
  };
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const caches = { open: async (n) => cacheApi(n), keys: async () => [...store.keys()], delete: async (n) => store.delete(n) };
  // In a browser a worker resolves relative URLs against its own address; Node's Request does not.
  class WorkerRequest extends Request {
    constructor(input, init) {
      super(typeof input === 'string' ? new URL(input, 'https://app.test').href : input, init);
    }
  }
  const context = vm.createContext({ self, caches, fetch: fetchImpl, URL, Request: WorkerRequest, Response, AbortController, setTimeout, clearTimeout, Promise });
  vm.runInContext(read('sw.js'), context);

  /** Dispatches a fetch event; returns the response, or `undefined` if the worker stayed out of it. */
  const dispatch = async (url, init = {}, mode = 'cors') => {
    const request = new Request(url, init);
    Object.defineProperty(request, 'mode', { value: mode });
    let responded;
    handlers.fetch({ request, respondWith: (p) => (responded = p) });
    return responded ? await responded : undefined;
  };
  const lifecycle = async (type) => {
    const waits = [];
    handlers[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { dispatch, lifecycle, store, self };
}

const html = (body = '') => new Response(`<!doctype html><script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-abc.css">${body}`, { status: 200, headers: { 'content-type': 'text/html' } });

describe('service worker: build stamp', () => {
  it('has exactly one build-ID placeholder, and it is in the code (so the build plugin stamps the right place)', () => {
    const src = read('sw.js');
    expect(src.match(/__BUILD_ID__/g)).toHaveLength(1);
    expect(src).toContain("const BUILD = '__BUILD_ID__';");
  });
});

describe('service worker: privacy', () => {
  it('never handles API requests, so private data is never cached', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"secret":true}', { headers: { 'content-type': 'application/json' } }));
    const sw = loadWorker({ fetchImpl });
    for (const url of ['https://app.test/api/resources', 'https://app.test/api/auth/refresh', 'https://app.test/api']) {
      expect(await sw.dispatch(url)).toBeUndefined();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sw.store.size).toBe(0);
  });

  it('ignores writes, other origins and range requests', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => html()) });
    expect(await sw.dispatch('https://app.test/assets/a.js', { method: 'POST', body: 'x' })).toBeUndefined();
    expect(await sw.dispatch('https://fonts.gstatic.com/font.woff2')).toBeUndefined();
    expect(await sw.dispatch('https://app.test/assets/video.mp4', { headers: { range: 'bytes=0-10' } })).toBeUndefined();
  });

  it('does not take over unknown same-origin requests such as the worker file itself', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => html()) });
    expect(await sw.dispatch('https://app.test/sw.js')).toBeUndefined();
  });
});

describe('service worker: offline behaviour', () => {
  it('pre-caches the shell and the files it names on install, then activates immediately', async () => {
    const fetchImpl = vi.fn(async (req) => (new URL(req.url).pathname === '/' ? html() : new Response('asset', { status: 200 })));
    const sw = loadWorker({ fetchImpl });
    await sw.lifecycle('install');
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    expect([...sw.store.get('mm-shell').keys()]).toEqual(['https://app.test/']);
    expect([...sw.store.get('mm-assets').keys()].sort()).toEqual(['https://app.test/assets/index-abc.css', 'https://app.test/assets/index-abc.js']);
    await sw.lifecycle('activate');
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('still installs when the network is down', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => Promise.reject(new TypeError('offline'))) });
    await expect(sw.lifecycle('install')).resolves.toBeUndefined();
  });

  it('serves hashed assets from the cache first, and caches only successful responses', async () => {
    const fetchImpl = vi.fn(async (req) => (req.url.endsWith('missing.js') ? new Response('nope', { status: 404 }) : new Response('code', { status: 200 })));
    const sw = loadWorker({ fetchImpl });
    expect(await (await sw.dispatch('https://app.test/assets/a-1.js')).text()).toBe('code');
    expect(await (await sw.dispatch('https://app.test/assets/a-1.js')).text()).toBe('code');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await sw.dispatch('https://app.test/assets/missing.js')).status).toBe(404);
    expect(sw.store.get('mm-assets').has('https://app.test/assets/missing.js')).toBe(false);
  });

  it('opens the cached shell when the network fails, for any app route', async () => {
    let online = true;
    const fetchImpl = vi.fn(async () => {
      if (!online) throw new TypeError('offline');
      return html('<p>live</p>');
    });
    const sw = loadWorker({ fetchImpl });
    expect(await (await sw.dispatch('https://app.test/vault/123', {}, 'navigate')).text()).toContain('live');
    online = false;
    const offline = await sw.dispatch('https://app.test/graph', {}, 'navigate');
    expect(await offline.text()).toContain('live');
  });

  it('falls back to the cached shell when the server is failing with a 5xx', async () => {
    let status = 200;
    const fetchImpl = vi.fn(async () => (status === 200 ? html('<p>cached copy</p>') : new Response('bad gateway', { status })));
    const sw = loadWorker({ fetchImpl });
    await sw.dispatch('https://app.test/', {}, 'navigate');
    status = 502;
    expect(await (await sw.dispatch('https://app.test/', {}, 'navigate')).text()).toContain('cached copy');
  });

  it('lets a failing navigation fail normally when nothing is cached yet', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => Promise.reject(new TypeError('offline'))) });
    await expect(sw.dispatch('https://app.test/', {}, 'navigate')).rejects.toThrow('offline');
  });

  it('keeps the asset cache from growing without limit', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => new Response('x', { status: 200 })) });
    for (let i = 0; i < 160; i++) await sw.dispatch(`https://app.test/assets/f-${i}.js`);
    const keys = [...sw.store.get('mm-assets').keys()];
    expect(keys.length).toBe(150);
    expect(keys).not.toContain('https://app.test/assets/f-0.js');
    expect(keys).toContain('https://app.test/assets/f-159.js');
  });

  it('removes caches from older schemes on activate but keeps the current ones', async () => {
    const sw = loadWorker({ fetchImpl: vi.fn(async () => html()) });
    await sw.dispatch('https://app.test/assets/a.js');
    sw.store.set('mm-v0-old', new Map([['x', 1]]));
    await sw.lifecycle('activate');
    expect([...sw.store.keys()]).toEqual(['mm-assets']);
  });
});

describe('install prompt', () => {
  it('offers install once the browser says it can, and uses the prompt only once', async () => {
    watchInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    expect(await result.current.install()).toBe('unavailable');

    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); // our button replaces the browser's own banner
    expect(result.current.canInstall).toBe(true);

    let outcome;
    await act(async () => {
      outcome = await result.current.install();
    });
    expect(outcome).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  it('hides the button after the app gets installed', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    act(() => void window.dispatchEvent(event));
    expect(result.current.canInstall).toBe(true);
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(result.current.canInstall).toBe(false);
  });
});

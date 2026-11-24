import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api, fetchBlob, http, isNetworkError, networkError, qs, refreshSession, setAccessToken, setSessionLostHandler, streamSse, uploadWithProgress } from './client.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const apiError = (status, code, message = 'nope', details) => json({ error: { code, message, details } }, status);

let fetchMock;
let onSessionLost;
const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  onSessionLost = vi.fn();
  setSessionLostHandler(onSessionLost);
  setAccessToken(null);
  setOnline(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

const callOf = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n];
  return { url, init, headers: init.headers };
};

describe('qs', () => {
  it('builds a query string and skips empty values', () => {
    expect(qs({ q: 'cats', page: 2, empty: '', none: null, missing: undefined })).toBe('?q=cats&page=2');
  });
  it('joins arrays with commas and drops empty arrays', () => {
    expect(qs({ tags: ['a', 'b'], none: [] })).toBe('?tags=a%2Cb');
  });
  it('returns an empty string when nothing is set, and encodes awkward text', () => {
    expect(qs({})).toBe('');
    expect(qs({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });
  it('keeps zero and false (they are real values)', () => {
    expect(qs({ page: 0, flag: false })).toBe('?page=0&flag=false');
  });
});

describe('requests', () => {
  it('sends cookies, no body headers on a GET, and the access token when there is one', async () => {
    fetchMock.mockImplementation(async () => json({ ok: 1 }));
    await http.get('/things');
    let c = callOf(0);
    expect(c.url).toBe('/api/things');
    expect(c.init.method).toBe('GET');
    expect(c.init.credentials).toBe('include');
    expect(c.headers.Authorization).toBeUndefined();
    expect(c.headers['Content-Type']).toBeUndefined();

    setAccessToken('tok123');
    await http.get('/things');
    c = callOf(1);
    expect(c.headers.Authorization).toBe('Bearer tok123');
  });

  it('sends JSON bodies with a content type, for every verb', async () => {
    fetchMock.mockImplementation(async () => json({ ok: 1 }));
    await http.post('/a', { x: 1 });
    await http.patch('/a', { y: 2 });
    await http.put('/a', { z: 3 });
    await http.del('/a');
    expect(fetchMock.mock.calls.map(([, i]) => i.method)).toEqual(['POST', 'PATCH', 'PUT', 'DELETE']);
    expect(callOf(0).init.body).toBe('{"x":1}');
    expect(callOf(0).headers['Content-Type']).toBe('application/json');
    expect(callOf(1).init.body).toBe('{"y":2}');
    expect(callOf(3).init.body).toBeUndefined();
  });

  it('returns null for 204 and for empty bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await http.del('/x')).toBeNull();
    expect(await http.get('/y')).toBeNull();
  });
});

describe('error mapping', () => {
  it('turns an error response into an ApiRequestError with status, code, message and field details', async () => {
    fetchMock.mockResolvedValue(apiError(400, 'VALIDATION', 'Please fix the highlighted fields', { fields: { email: 'Enter a valid email' } }));
    const err = await http.post('/auth/login', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION', message: 'Please fix the highlighted fields' });
    expect(err.fields).toEqual({ email: 'Enter a valid email' });
  });

  it('copes with error bodies that are not JSON, or are empty', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 })).mockResolvedValueOnce(new Response('', { status: 500 }));
    const a = await http.get('/x').catch((e) => e);
    expect(a).toMatchObject({ status: 502, message: 'Bad gateway', code: 'ERROR' });
    const b = await http.get('/x').catch((e) => e);
    expect(b).toMatchObject({ status: 500, message: 'Request failed (500)', code: 'ERROR' });
    expect(b.fields).toEqual({});
  });

  it('reports a network failure, and says "offline" when the browser knows it is', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    let err = await http.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(isNetworkError(err)).toBe(true);
    setOnline(false);
    err = await http.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'OFFLINE' });
    expect(err.message).toMatch(/offline/i);
    expect(isNetworkError(err)).toBe(true);
  });

  it('lets an aborted request through untouched, so callers can ignore it', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abort);
    const err = await http.get('/x').catch((e) => e);
    expect(err).toBe(abort);
    expect(isNetworkError(err)).toBe(false);
  });

  it('networkError words the failed action, and isNetworkError ignores other errors', () => {
    expect(networkError('save your note').message).toBe('Could not save your note. Check your connection and try again.');
    expect(isNetworkError(new ApiRequestError(500, 'x', 'ERROR'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('automatic sign-in refresh', () => {
  it('refreshes an expired token once, then repeats the request with the new token', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh') return json({ accessToken: 'new', user: { id: 1 } });
      return init.headers.Authorization === 'Bearer new' ? json({ items: [1] }) : apiError(401, 'TOKEN_EXPIRED', 'Token expired');
    });
    expect(await http.get('/resources')).toEqual({ items: [1] });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['/api/resources', '/api/auth/refresh', '/api/resources']);
    expect(callOf(1).init.method).toBe('POST');
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('shares one refresh between requests that expire at the same moment', async () => {
    setAccessToken('old');
    let refreshes = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh') {
        refreshes++;
        await new Promise((r) => setTimeout(r, 20));
        return json({ accessToken: 'new' });
      }
      return init.headers.Authorization === 'Bearer new' ? json({ path: url }) : apiError(401, 'TOKEN_EXPIRED');
    });
    const results = await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    expect(results.map((r) => r.path)).toEqual(['/api/a', '/api/b', '/api/c']);
    expect(refreshes).toBe(1);
  });

  it('gives up if the request still fails after one refresh (no endless loop)', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url) => (url === '/api/auth/refresh' ? json({ accessToken: 'new' }) : apiError(401, 'TOKEN_EXPIRED', 'still expired')));
    const err = await http.get('/x').catch((e) => e);
    expect(err.status).toBe(401);
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('signs the user out when the refresh itself is refused', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url) => (url === '/api/auth/refresh' ? apiError(401, 'SESSION_REVOKED', 'Signed out') : apiError(401, 'TOKEN_EXPIRED')));
    const err = await http.get('/x').catch((e) => e);
    expect(err.code).toBe('SESSION_REVOKED');
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(onSessionLost.mock.calls[0][0].code).toBe('SESSION_REVOKED');
    // the old token is gone: the next call sends none
    fetchMock.mockReset().mockResolvedValue(json({}));
    await http.get('/y');
    expect(callOf(0).headers.Authorization).toBeUndefined();
  });

  it('does not sign the user out when the refresh fails only because of the network', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') throw new TypeError('Failed to fetch');
      return apiError(401, 'TOKEN_EXPIRED');
    });
    const err = await http.get('/x').catch((e) => e);
    expect(err.code).toBe('NETWORK');
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('signs out at once for revoked or reused sessions, without trying to refresh', async () => {
    for (const code of ['SESSION_REVOKED', 'TOKEN_REUSE', 'USER_NOT_FOUND', 'NO_SESSION']) {
      fetchMock.mockReset().mockResolvedValue(apiError(401, code, 'x'));
      onSessionLost.mockClear();
      await http.get('/x').catch(() => {});
      expect(onSessionLost, code).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('treats a 401 with an unknown code as a lost session too', async () => {
    fetchMock.mockResolvedValue(apiError(401, 'WEIRD', 'x'));
    await http.get('/x').catch(() => {});
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('leaves /auth requests alone: a wrong password is just an error, not a lost session', async () => {
    fetchMock.mockResolvedValue(apiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'));
    const err = await http.post('/auth/login', { email: 'a@b.c', password: 'x' }).catch((e) => e);
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat a revoked-session reply from an /auth call (such as logout) as a new lost session', async () => {
    fetchMock.mockResolvedValue(apiError(401, 'SESSION_REVOKED', 'Already signed out'));
    const err = await http.post('/auth/logout').catch((e) => e);
    expect(err.code).toBe('SESSION_REVOKED');
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for other errors such as 403 or 500', async () => {
    fetchMock.mockResolvedValue(apiError(403, 'FORBIDDEN', 'No'));
    await api('/x').catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('refreshSession stores the new token and returns the user', async () => {
    fetchMock.mockResolvedValue(json({ accessToken: 'abc', user: { name: 'Ada' } }));
    const data = await refreshSession();
    expect(data.user.name).toBe('Ada');
    fetchMock.mockResolvedValue(json({}));
    await http.get('/x');
    expect(callOf(1).headers.Authorization).toBe('Bearer abc');
  });
});

describe('fetchBlob', () => {
  it('returns the file as a Blob', async () => {
    fetchMock.mockResolvedValue(new Response('file-bytes', { status: 200 }));
    const blob = await fetchBlob('/resources/1/file');
    expect(await blob.text()).toBe('file-bytes');
    expect(callOf(0).url).toBe('/api/resources/1/file');
  });

  it('refreshes an expired token once and retries', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh') return json({ accessToken: 'new' });
      return init.headers.Authorization === 'Bearer new' ? new Response('ok') : new Response('', { status: 401 });
    });
    expect(await (await fetchBlob('/f')).text()).toBe('ok');
  });

  it('maps a failed download to an ApiRequestError', async () => {
    fetchMock.mockResolvedValue(apiError(404, 'NOT_FOUND', 'The stored file is missing'));
    const err = await fetchBlob('/f').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'The stored file is missing' });
  });

  it('reports network failures properly and lets aborts through', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await fetchBlob('/f').catch((e) => e)).code).toBe('NETWORK');
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abort);
    expect(await fetchBlob('/f').catch((e) => e)).toBe(abort);
  });
});

describe('streamSse', () => {
  const enc = new TextEncoder();
  const stream = (chunks, status = 200) =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const ch of chunks) c.enqueue(enc.encode(ch));
          c.close();
        },
      }),
      { status, headers: { 'content-type': 'text/event-stream' } }
    );

  it('delivers each event with its name and parsed data', async () => {
    fetchMock.mockResolvedValue(stream(['event: meta\ndata: {"id":1}\n\n', 'event: delta\ndata: {"text":"Hi"}\n\n', 'event: done\ndata: {"ok":true}\n\n']));
    const seen = [];
    await streamSse('/conversations/1/messages', { content: 'x' }, { onEvent: (e, d) => seen.push([e, d]) });
    expect(seen).toEqual([['meta', { id: 1 }], ['delta', { text: 'Hi' }], ['done', { ok: true }]]);
    const c = callOf(0);
    expect(c.init.method).toBe('POST');
    expect(c.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(c.init.body)).toEqual({ content: 'x' });
  });

  it('reassembles events that arrive split across chunks, even in the middle of a word', async () => {
    fetchMock.mockResolvedValue(stream(['event: del', 'ta\ndata: {"te', 'xt":"héllo"}\n', '\nevent: done\nda', 'ta: {}\n\n']));
    const seen = [];
    await streamSse('/x', {}, { onEvent: (e, d) => seen.push([e, d]) });
    expect(seen).toEqual([['delta', { text: 'héllo' }], ['done', {}]]);
  });

  it('defaults the event name to "message" and ignores blocks without data', async () => {
    fetchMock.mockResolvedValue(stream([': keep-alive\n\n', 'data: {"a":1}\n\n', 'event: ping\n\n']));
    const seen = [];
    await streamSse('/x', {}, { onEvent: (e, d) => seen.push([e, d]) });
    expect(seen).toEqual([['message', { a: 1 }]]);
  });

  it('rejects with the server’s error when it refuses before streaming starts', async () => {
    fetchMock.mockResolvedValue(apiError(409, 'CONVERSATION_BUSY', 'Another answer is still being written'));
    const err = await streamSse('/x', {}, { onEvent: vi.fn() }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: 'CONVERSATION_BUSY' });
  });

  it('refreshes an expired token before the stream begins', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh') return json({ accessToken: 'new' });
      return init.headers.Authorization === 'Bearer new' ? stream(['event: done\ndata: {}\n\n']) : apiError(401, 'TOKEN_EXPIRED');
    });
    const seen = [];
    await streamSse('/x', {}, { onEvent: (e) => seen.push(e) });
    expect(seen).toEqual(['done']);
  });

  it('does not retry a 401 that is not about an expired token', async () => {
    fetchMock.mockResolvedValue(apiError(401, 'SESSION_REVOKED', 'Signed out'));
    const err = await streamSse('/x', {}, {}).catch((e) => e);
    expect(err).toMatchObject({ status: 401, code: 'SESSION_REVOKED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure and lets aborts through', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await streamSse('/x', {}, {}).catch((e) => e)).code).toBe('NETWORK');
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abort);
    expect(await streamSse('/x', {}, {}).catch((e) => e)).toBe(abort);
  });
});

describe('uploadWithProgress', () => {
  /** A stand-in for XMLHttpRequest that lets each test decide how the upload ends. */
  class FakeXhr {
    static instances = [];
    static script = [];
    constructor() {
      this.headers = {};
      this.upload = {};
      this.listeners = [];
      FakeXhr.instances.push(this);
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    abort() {
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      const step = FakeXhr.script.shift() || { status: 200, text: '{}' };
      queueMicrotask(() => {
        if (step.progress) step.progress.forEach(([loaded, total]) => this.upload.onprogress?.({ lengthComputable: true, loaded, total }));
        if (step.networkError) return this.onerror?.();
        if (step.hang) return undefined;
        this.status = step.status;
        this.responseText = step.text;
        return this.onload?.();
      });
    }
  }

  beforeEach(() => {
    FakeXhr.instances = [];
    FakeXhr.script = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('posts the form with cookies and the token, reports progress and resolves with the JSON', async () => {
    setAccessToken('tok');
    FakeXhr.script = [{ progress: [[25, 100], [100, 100]], status: 202, text: '{"resource":{"id":"r1"}}' }];
    const form = new FormData();
    const onProgress = vi.fn();
    const data = await uploadWithProgress('/resources/documents', form, { onProgress });
    expect(data).toEqual({ resource: { id: 'r1' } });
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0.25, 1]);
    const x = FakeXhr.instances[0];
    expect(x).toMatchObject({ method: 'POST', url: '/api/resources/documents', withCredentials: true });
    expect(x.headers.Authorization).toBe('Bearer tok');
    expect(x.body).toBe(form);
  });

  it('turns an error response into an ApiRequestError, including plain-text failures', async () => {
    FakeXhr.script = [{ status: 413, text: '{"error":{"code":"FILE_TOO_LARGE","message":"That file is too large"}}' }];
    let err = await uploadWithProgress('/u', new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 413, code: 'FILE_TOO_LARGE', message: 'That file is too large' });
    FakeXhr.script = [{ status: 502, text: 'Bad gateway' }];
    err = await uploadWithProgress('/u', new FormData()).catch((e) => e);
    expect(err).toMatchObject({ status: 502, message: 'Bad gateway' });
    FakeXhr.script = [{ status: 500, text: '' }];
    err = await uploadWithProgress('/u', new FormData()).catch((e) => e);
    expect(err.message).toBe('Upload failed (500)');
  });

  it('reports a dropped connection, and says offline when offline', async () => {
    FakeXhr.script = [{ networkError: true }];
    let err = await uploadWithProgress('/u', new FormData()).catch((e) => e);
    expect(err).toMatchObject({ code: 'NETWORK' });
    expect(err.message).toMatch(/finish the upload/);
    setOnline(false);
    FakeXhr.script = [{ networkError: true }];
    err = await uploadWithProgress('/u', new FormData()).catch((e) => e);
    expect(err.code).toBe('OFFLINE');
  });

  it('can be cancelled, which rejects with an AbortError', async () => {
    FakeXhr.script = [{ hang: true }];
    const ctrl = new AbortController();
    const p = uploadWithProgress('/u', new FormData(), { signal: ctrl.signal });
    await Promise.resolve();
    ctrl.abort();
    const err = await p.catch((e) => e);
    expect(err.name).toBe('AbortError');
  });

  it('refreshes an expired token and sends the file again from 0%', async () => {
    setAccessToken('old');
    FakeXhr.script = [{ status: 401, text: '{"error":{"code":"TOKEN_EXPIRED","message":"expired"}}' }, { progress: [[1, 2]], status: 201, text: '{"ok":true}' }];
    fetchMock.mockResolvedValue(json({ accessToken: 'fresh' }));
    const onProgress = vi.fn();
    const data = await uploadWithProgress('/u', new FormData(), { onProgress });
    expect(data).toEqual({ ok: true });
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.instances[1].headers.Authorization).toBe('Bearer fresh');
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([0, 0.5]);
  });
});

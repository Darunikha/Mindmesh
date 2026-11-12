/**
 * Thin fetch wrapper.
 * - Access token lives in memory only (never localStorage).
 * - On TOKEN_EXPIRED, performs a single shared refresh and retries once.
 * - Normalises all failures into ApiRequestError with field-level details.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

let accessToken = null;
let refreshPromise = null;
let onSessionLost = () => {};

export class ApiRequestError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = details?.fields || {};
    this.details = details;
  }
}

export function setAccessToken(token) {
  accessToken = token;
}

export function setSessionLostHandler(fn) {
  onSessionLost = fn;
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

async function raw(path, { method = 'GET', body, headers = {}, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'Could not reach the Mindmesh server. Check your connection and try again.', 'NETWORK');
  }
  const data = await parse(res);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiRequestError(res.status, e.message || `Request failed (${res.status})`, e.code || 'ERROR', e.details);
  }
  return data;
}

/** Exchanges the httpOnly refresh cookie for a fresh access token. Shared across callers. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = raw('/auth/refresh', { method: 'POST' })
      .then((data) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const SESSION_CODES = new Set(['SESSION_REVOKED', 'USER_NOT_FOUND', 'TOKEN_REUSE', 'NO_SESSION']);

export async function api(path, options = {}) {
  try {
    return await raw(path, options);
  } catch (err) {
    if (err.status !== 401 || options._retried || path.startsWith('/auth/')) {
      if (err.status === 401 && SESSION_CODES.has(err.code) && !path.startsWith('/auth/')) onSessionLost(err);
      throw err;
    }
    if (err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_INVALID' || err.code === 'UNAUTHORIZED') {
      try {
        await refreshSession();
      } catch (refreshErr) {
        setAccessToken(null);
        onSessionLost(refreshErr);
        throw refreshErr;
      }
      return api(path, { ...options, _retried: true });
    }
    onSessionLost(err);
    throw err;
  }
}

export const http = {
  get: (p, o) => api(p, { ...o, method: 'GET' }),
  post: (p, body, o) => api(p, { ...o, method: 'POST', body }),
  patch: (p, body, o) => api(p, { ...o, method: 'PATCH', body }),
  put: (p, body, o) => api(p, { ...o, method: 'PUT', body }),
  del: (p, body, o) => api(p, { ...o, method: 'DELETE', body }),
};

/** Downloads a protected binary (e.g. an uploaded file) as a Blob, refreshing the token once if needed. */
export async function fetchBlob(path, { signal } = {}) {
  const attempt = () =>
    fetch(`${BASE}${path}`, { credentials: 'include', signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let res = await attempt();
  if (res.status === 401) {
    await refreshSession();
    res = await attempt();
  }
  if (!res.ok) {
    const data = await parse(res);
    const e = data?.error || {};
    throw new ApiRequestError(res.status, e.message || `Download failed (${res.status})`, e.code || 'ERROR', e.details);
  }
  return res.blob();
}

/**
 * Multipart upload via XMLHttpRequest so we get real upload-progress events.
 * Resolves with the parsed JSON body; rejects with ApiRequestError (or AbortError).
 */
export function uploadWithProgress(path, formData, { onProgress, signal } = {}) {
  const send = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}${path}`);
      xhr.withCredentials = true;
      if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = { error: { message: xhr.responseText } };
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          const e = data?.error || {};
          reject(new ApiRequestError(xhr.status, e.message || `Upload failed (${xhr.status})`, e.code || 'ERROR', e.details));
        }
      };
      xhr.onerror = () => reject(new ApiRequestError(0, 'The upload was interrupted. Check your connection and try again.', 'NETWORK'));
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(formData);
    });

  return send().catch(async (err) => {
    if (err.status === 401 && err.code === 'TOKEN_EXPIRED') {
      await refreshSession();
      onProgress?.(0);
      return send();
    }
    throw err;
  });
}

/**
 * POSTs JSON and consumes a text/event-stream response, calling onEvent(event, data) for each
 * server-sent event. Non-2xx responses (sent as JSON before streaming starts) reject with
 * ApiRequestError. Refreshes an expired access token once before the stream begins.
 */
export async function streamSse(path, body, { onEvent, signal } = {}) {
  const attempt = () =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  let res;
  try {
    res = await attempt();
    if (res.status === 401) {
      const data = await parse(res);
      if (data?.error?.code !== 'TOKEN_EXPIRED' && data?.error?.code !== 'UNAUTHORIZED') {
        throw new ApiRequestError(401, data?.error?.message || 'Unauthorized', data?.error?.code);
      }
      await refreshSession();
      res = await attempt();
    }
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof ApiRequestError) throw err;
    throw new ApiRequestError(0, 'Could not reach the Mindmesh server. Check your connection and try again.', 'NETWORK');
  }

  if (!res.ok) {
    const data = await parse(res);
    const e = data?.error || {};
    throw new ApiRequestError(res.status, e.message || `Request failed (${res.status})`, e.code || 'ERROR', e.details);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent?.(event, JSON.parse(data));
    }
  }
}

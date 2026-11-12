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
  del: (p, body, o) => api(p, { ...o, method: 'DELETE', body }),
};

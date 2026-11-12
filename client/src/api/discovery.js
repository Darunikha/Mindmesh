import { http } from './client.js';

function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    s.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const searchApi = {
  search: (params, opts) => http.get(`/search${qs(params)}`, opts),
  suggest: (q, opts) => http.get(`/search/suggest${qs({ q })}`, opts),
  recent: () => http.get('/search/recent'),
  deleteRecent: (id) => http.del(`/search/recent/${id}`),
  clearRecent: () => http.del('/search/recent'),
};

export const graphApi = {
  get: (params) => http.get(`/graph${qs(params)}`),
  createConnection: (body) => http.post('/graph/connections', body),
  updateConnection: (id, body) => http.patch(`/graph/connections/${id}`, body),
  deleteConnection: (id) => http.del(`/graph/connections/${id}`),
  suggestions: () => http.get('/graph/suggestions'),
  generate: () => http.post('/graph/suggestions/generate', {}),
  accept: (id) => http.post(`/graph/suggestions/${id}/accept`, {}),
  dismiss: (id) => http.post(`/graph/suggestions/${id}/dismiss`, {}),
  related: (resourceId) => http.get(`/graph/related/${resourceId}`),
  saveLayout: (positions) => http.put('/graph/layout', { positions }),
  resetLayout: () => http.del('/graph/layout'),
};

export const timelineApi = {
  list: (params) => http.get(`/timeline${qs(params)}`),
  summary: (params) => http.get(`/timeline/summary${qs(params)}`),
};

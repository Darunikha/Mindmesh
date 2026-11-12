import { http, qs, streamSse } from './client.js';

export const conversationsApi = {
  list: (params = {}) => http.get(`/conversations${qs(params)}`),
  create: (body = {}) => http.post('/conversations', body),
  get: (id) => http.get(`/conversations/${id}`),
  update: (id, body) => http.patch(`/conversations/${id}`, body),
  remove: (id) => http.del(`/conversations/${id}`),
  send: (id, body, opts) => streamSse(`/conversations/${id}/messages`, body, opts),
  regenerate: (id, messageId, body, opts) => streamSse(`/conversations/${id}/messages/${messageId}/regenerate`, body, opts),
};

export const aiApi = {
  status: () => http.get('/ai/status'),
  reindex: (force = false) => http.post('/ai/reindex', { force }),
};

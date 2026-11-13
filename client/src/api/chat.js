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

export const learningApi = {
  saveAnswer: (conversationId, messageId, body = {}) => http.post(`/conversations/${conversationId}/messages/${messageId}/save`, body),
};

export const flashcardsApi = {
  list: (params = {}) => http.get(`/flashcards${qs(params)}`),
  stats: () => http.get('/flashcards/stats'),
  due: (params = {}) => http.get(`/flashcards/due${qs(params)}`),
  create: (body) => http.post('/flashcards', body),
  update: (id, body) => http.patch(`/flashcards/${id}`, body),
  remove: (id) => http.del(`/flashcards/${id}`),
  review: (id, grade) => http.post(`/flashcards/${id}/review`, { grade }),
  generate: (resourceId, count = 8) => http.post('/flashcards/generate', { resourceId, count }),
};

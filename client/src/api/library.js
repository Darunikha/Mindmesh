import { fetchBlob, http, uploadWithProgress } from './client.js';

function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    s.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const libraryApi = {
  list: (params, opts) => http.get(`/resources${qs(params)}`, opts),
  overview: () => http.get('/resources/overview'),
  get: (id, { touch = true } = {}) => http.get(`/resources/${id}${touch ? '' : '?touch=false'}`),
  chunks: (id, page = 1, limit = 30) => http.get(`/resources/${id}/chunks?page=${page}&limit=${limit}`),
  createNote: (body) => http.post('/resources/notes', body),
  createLink: (body) => http.post('/resources/links', body),
  update: (id, body) => http.patch(`/resources/${id}`, body),
  remove: (id) => http.del(`/resources/${id}`),
  reprocess: (id) => http.post(`/resources/${id}/reprocess`),
  bulk: (body) => http.post('/resources/bulk', body),
  fileBlob: (id, opts) => fetchBlob(`/resources/${id}/file`, opts),
  upload: (file, { collectionId, tags, title } = {}, opts) => {
    const form = new FormData();
    if (title) form.append('title', title);
    if (collectionId) form.append('collectionId', collectionId);
    if (tags?.length) form.append('tags', JSON.stringify(tags));
    form.append('file', file);
    return uploadWithProgress('/resources/documents', form, opts);
  },
};

export const collectionsApi = {
  list: () => http.get('/collections'),
  create: (body) => http.post('/collections', body),
  update: (id, body) => http.patch(`/collections/${id}`, body),
  remove: (id, moveTo) => http.del(`/collections/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),
};

export const tagsApi = {
  list: () => http.get('/tags'),
  create: (body) => http.post('/tags', body),
  update: (id, body) => http.patch(`/tags/${id}`, body),
  remove: (id) => http.del(`/tags/${id}`),
};

export const SUPPORTED_UPLOADS = ['.pdf', '.docx', '.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.rtf'];
export const MAX_UPLOAD_MB = 25;

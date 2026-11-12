import { http } from './client.js';

export const authApi = {
  register: (body) => http.post('/auth/register', body),
  login: (body) => http.post('/auth/login', body),
  logout: () => http.post('/auth/logout'),
  logoutAll: () => http.post('/auth/logout-all'),
};

export const usersApi = {
  me: () => http.get('/users/me'),
  updateProfile: (body) => http.patch('/users/me', body),
  updatePreferences: (body) => http.patch('/users/me/preferences', body),
  completeOnboarding: (body) => http.post('/users/me/onboarding', body),
  changePassword: (body) => http.post('/users/me/password', body),
  sessions: () => http.get('/users/me/sessions'),
  revokeSession: (id) => http.del(`/users/me/sessions/${id}`),
  deleteAccount: (body) => http.del('/users/me', body),
};

export const systemApi = {
  health: () => http.get('/health'),
};

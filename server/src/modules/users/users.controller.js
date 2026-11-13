import * as usersService from './users.service.js';
import { REFRESH_COOKIE } from '../auth/auth.controller.js';

export function getMe(req, res) {
  res.json({ user: req.user.toPublic() });
}

export async function updateMe(req, res) {
  const user = await usersService.updateProfile(req.user._id, req.body);
  res.json({ user: user.toPublic() });
}

export async function updatePreferences(req, res) {
  const user = await usersService.updatePreferences(req.user._id, req.body);
  res.json({ user: user.toPublic() });
}

export async function completeOnboarding(req, res) {
  const user = await usersService.completeOnboarding(req.user._id, req.body);
  res.json({ user: user.toPublic() });
}

export async function changePassword(req, res) {
  const { user, revokedSessions } = await usersService.changePassword(req.user._id, req.sessionId, req.body);
  res.json({ user: user.toPublic(), revokedSessions });
}

export async function listSessions(req, res) {
  res.json({ sessions: await usersService.listSessions(req.user._id, req.sessionId) });
}

export async function revokeSession(req, res) {
  await usersService.revokeSession(req.user._id, req.params.id);
  res.status(204).end();
}

export async function exportMe(req, res) {
  const data = await usersService.exportData(req.user._id);
  res.set({ 'Content-Disposition': 'attachment; filename="mindmesh-export.json"', 'Cache-Control': 'no-store' });
  res.json(data);
}

export async function deleteMe(req, res) {
  await usersService.deleteAccount(req.user._id, req.body.password);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
}

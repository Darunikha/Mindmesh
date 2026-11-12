import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';

let mongo;
let app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('mindmesh-test'));
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const creds = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'analytical1' };

function refreshCookie(res) {
  const raw = res.headers['set-cookie'] || [];
  const c = raw.find((x) => x.startsWith('mm_rt='));
  return c ? c.split(';')[0] : null;
}

async function registerUser(body = creds) {
  const res = await request(app).post('/api/auth/register').send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { res, token: res.body.accessToken, cookie: refreshCookie(res) };
}

describe('auth', () => {
  it('registers, normalises email, never returns the password hash, sets httpOnly refresh cookie', async () => {
    const { res, cookie } = await registerUser();
    assert.equal(res.body.user.email, 'ada@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.preferences.theme, 'library');
    assert.equal(res.body.user.onboardingCompleted, false);
    assert.ok(cookie);
    const header = res.headers['set-cookie'].find((x) => x.startsWith('mm_rt='));
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=Strict/i);
  });

  it('rejects duplicate emails and weak passwords with field errors', async () => {
    await registerUser();
    const dup = await request(app).post('/api/auth/register').send(creds);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'EMAIL_TAKEN');

    const weak = await request(app).post('/api/auth/register').send({ ...creds, email: 'b@x.com', password: 'short' });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.details.fields.password);
  });

  it('logs in with correct credentials and rejects wrong ones identically', async () => {
    await registerUser();
    const ok = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: creds.password });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.accessToken);

    const wrongPw = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'nope12345' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope12345' });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.body.error.message, noUser.body.error.message);
  });

  it('protects routes and rejects tampered tokens', async () => {
    const none = await request(app).get('/api/users/me');
    assert.equal(none.status, 401);
    const { token } = await registerUser();
    const bad = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}x`);
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'TOKEN_INVALID');
    const good = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    assert.equal(good.status, 200);
  });

  it('rotates refresh tokens and detects reuse of an old token', async () => {
    const { cookie } = await registerUser();
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    assert.equal(r1.status, 200);
    const cookie2 = refreshCookie(r1);
    assert.notEqual(cookie2, cookie);

    // Replaying the first (already rotated) token revokes everything.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'TOKEN_REUSE');

    const after = await request(app).post('/api/auth/refresh').set('Cookie', cookie2);
    assert.equal(after.status, 401);
  });

  it('logout revokes the session immediately, including its access token', async () => {
    const { cookie, token } = await registerUser();
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    assert.equal(out.status, 204);
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    assert.equal(me.status, 401);
    assert.equal(me.body.error.code, 'SESSION_REVOKED');
  });
});

describe('users', () => {
  it('completes onboarding and persists theme, interests and AI mode', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: 'lab', interests: ['Machine Learning', 'machine learning', 'History'], defaultMode: 'hybrid' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.onboardingCompleted, true);
    assert.equal(res.body.user.preferences.theme, 'lab');
    assert.equal(res.body.user.preferences.ai.defaultMode, 'hybrid');
    assert.deepEqual(res.body.user.interests, ['machine learning', 'History']);
  });

  it('merges partial preference updates without clobbering siblings', async () => {
    const { token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).patch('/api/users/me/preferences').set(auth).send({ ai: { responseStyle: 'detailed' } });
    const res = await request(app).patch('/api/users/me/preferences').set(auth).send({ theme: 'studio', ai: { showFollowUps: false } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.preferences.theme, 'studio');
    assert.equal(res.body.user.preferences.ai.responseStyle, 'detailed');
    assert.equal(res.body.user.preferences.ai.showFollowUps, false);
    assert.equal(res.body.user.preferences.ai.defaultMode, 'general');

    const invalid = await request(app).patch('/api/users/me/preferences').set(auth).send({ theme: 'neon' });
    assert.equal(invalid.status, 400);
    const unknown = await request(app).patch('/api/users/me/preferences').set(auth).send({ isAdmin: true });
    assert.equal(unknown.status, 400);
  });

  it('changes password, keeps current session, revokes others', async () => {
    const a = await registerUser();
    const b = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const res = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ currentPassword: creds.password, newPassword: 'difference2' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.revokedSessions, 1);

    assert.equal((await request(app).get('/api/users/me').set('Authorization', `Bearer ${a.token}`)).status, 200);
    assert.equal((await request(app).get('/api/users/me').set('Authorization', `Bearer ${b.body.accessToken}`)).status, 401);
    const relog = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'difference2' });
    assert.equal(relog.status, 200);
  });

  it('lists sessions and prevents revoking another user\'s session', async () => {
    const a = await registerUser();
    const b = await registerUser({ name: 'Grace', email: 'grace@example.com', password: 'compiler1' });
    const list = await request(app).get('/api/users/me/sessions').set('Authorization', `Bearer ${b.token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.sessions.length, 1);
    assert.equal(list.body.sessions[0].current, true);

    const steal = await request(app)
      .delete(`/api/users/me/sessions/${list.body.sessions[0].id}`)
      .set('Authorization', `Bearer ${a.token}`);
    assert.equal(steal.status, 404);
    assert.equal((await request(app).get('/api/users/me').set('Authorization', `Bearer ${b.token}`)).status, 200);
  });

  it('deletes the account only with password and explicit confirmation', async () => {
    const { token } = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };
    const noConfirm = await request(app).delete('/api/users/me').set(auth).send({ password: creds.password });
    assert.equal(noConfirm.status, 400);
    const ok = await request(app).delete('/api/users/me').set(auth).send({ password: creds.password, confirm: 'DELETE' });
    assert.equal(ok.status, 204);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    assert.equal(login.status, 401);
  });
});

import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import { ensureStorage } from '../src/processing/storage.js';

/** Boots a fresh in-memory database and app for a test file. */
export async function startTestApp() {
  const mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('mindmesh-test'));
  await ensureStorage();
  const app = createApp();
  return {
    app,
    async stop() {
      await mongoose.disconnect();
      await mongo.stop();
    },
    async reset() {
      await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    },
  };
}

let counter = 0;
export async function makeUser(app, name = 'Tester') {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: `user${counter}-${Date.now()}@example.com`, password: 'password123' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const token = res.body.accessToken;
  const auth = { Authorization: `Bearer ${token}` };
  return {
    user: res.body.user,
    auth,
    get: (url) => request(app).get(url).set(auth),
    post: (url, body) => request(app).post(url).set(auth).send(body),
    patch: (url, body) => request(app).patch(url).set(auth).send(body),
    del: (url, body) => request(app).delete(url).set(auth).send(body),
    upload: (buffer, filename, fields = {}) => {
      let r = request(app).post('/api/resources/documents').set(auth);
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('file', buffer, filename);
    },
  };
}

export function doc(...paragraphs) {
  return {
    type: 'doc',
    content: paragraphs.map((p) =>
      typeof p === 'string' ? { type: 'paragraph', content: [{ type: 'text', text: p }] } : p
    ),
  };
}

export const heading = (text, level = 2) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });

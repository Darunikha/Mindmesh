import './setup-env.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import nodemailer from 'nodemailer';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import PasswordReset from '../src/models/PasswordReset.js';
import User from '../src/models/User.js';
import { setMailer, smtpOptions, whenMailSettled } from '../src/mail/mailer.js';
import { passwordResetEmail } from '../src/mail/templates.js';

let mongo;
let app;
let outbox;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('mindmesh-test'));
  await PasswordReset.init();
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  outbox = [];
  setMailer({ delivery: 'smtp', send: async (m) => outbox.push(m) });
});

afterEach(async () => {
  await whenMailSettled();
  setMailer(null);
});

const creds = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical1' };
const NEW_PASSWORD = 'difference2';

const register = (body = creds) => request(app).post('/api/auth/register').send(body);
const login = (password, email = creds.email) => request(app).post('/api/auth/login').send({ email, password });
const reset = (token, password = NEW_PASSWORD) => request(app).post('/api/auth/reset-password').send({ token, password });

async function forgot(email = creds.email) {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  await whenMailSettled();
  return res;
}

const tokenIn = (message) => message.text.match(/#token=([\w-]+)/)[1];
/** Pretends the last link was sent a while ago, so another may be requested. */
const skipCooldown = () => PasswordReset.updateMany({}, { sentAt: new Date(Date.now() - 5 * 60 * 1000) });

describe('forgot password', () => {
  it('emails a link built from the configured address, storing only a hash of its token', async () => {
    await register();
    const res = await request(app).post('/api/auth/forgot-password').set('Host', 'evil.example').set('Origin', 'http://localhost:5173').send({ email: '  ADA@Example.com ' });
    await whenMailSettled();
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { delivery: 'smtp', expiresInMinutes: 30 });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'ada@example.com');
    assert.match(outbox[0].text, /http:\/\/localhost:5173\/reset-password#token=[\w-]{43}/);
    assert.doesNotMatch(outbox[0].text + outbox[0].html, /evil\.example/);

    const stored = await PasswordReset.findOne().lean();
    assert.ok(!JSON.stringify(stored).includes(tokenIn(outbox[0])));
    const minutes = (stored.expiresAt - stored.sentAt) / 60000;
    assert.equal(minutes, 30);
  });

  it('answers an unknown email exactly like a known one, and sends nothing', async () => {
    await register();
    const known = await forgot();
    outbox.length = 0;
    const unknown = await forgot('nobody@example.com');
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(outbox.length, 0);
    assert.equal(await PasswordReset.countDocuments(), 1);
  });

  it('rejects something that is not an email address', async () => {
    const res = await forgot('not-an-email');
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.fields.email);
  });

  it('sends one email per minute per account, even when asked many times at once', async () => {
    await register();
    await Promise.all(Array.from({ length: 6 }, () => request(app).post('/api/auth/forgot-password').send({ email: creds.email })));
    await whenMailSettled();
    assert.equal(outbox.length, 1);
    await forgot();
    assert.equal(outbox.length, 1);
    // The one that was sent still works.
    assert.equal((await reset(tokenIn(outbox[0]))).status, 204);
  });

  it('a newer link replaces the older one', async () => {
    await register();
    await forgot();
    await skipCooldown();
    await forgot();
    assert.equal(outbox.length, 2);
    assert.equal((await reset(tokenIn(outbox[0]))).body.error.code, 'RESET_LINK_INVALID');
    assert.equal((await reset(tokenIn(outbox[1]))).status, 204);
  });

  it('says so when the server cannot send email', async () => {
    await register();
    setMailer({ delivery: 'none', send: async () => assert.fail('must not send') });
    const res = await forgot();
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'EMAIL_NOT_CONFIGURED');
    assert.equal(await PasswordReset.countDocuments(), 0);
  });

  it('hides a delivery failure from the visitor and allows an immediate retry', async (t) => {
    await register();
    const log = t.mock.method(console, 'error', () => {});
    setMailer({ delivery: 'smtp', send: async () => Promise.reject(new Error('mail server down')) });
    const res = await forgot();
    assert.equal(res.status, 202);
    assert.match(log.mock.calls[0].arguments[0], /mail server down/);
    assert.equal(await PasswordReset.countDocuments(), 0);

    setMailer({ delivery: 'smtp', send: async (m) => outbox.push(m) });
    await forgot();
    assert.equal(outbox.length, 1);
  });
});

describe('reset password', () => {
  async function linkFor() {
    const account = await register();
    await forgot();
    return { account, token: tokenIn(outbox[0]) };
  }

  it('sets the new password, retires the old one and confirms by email', async () => {
    const { token } = await linkFor();
    const res = await reset(token);
    await whenMailSettled();
    assert.equal(res.status, 204);
    assert.equal((await login(creds.password)).status, 401);
    assert.equal((await login(NEW_PASSWORD)).status, 200);
    assert.equal(outbox.length, 2);
    assert.equal(outbox[1].subject, 'Your Mindmesh password was changed');
    assert.ok((await User.findOne()).passwordChangedAt);
  });

  it('signs out every device', async () => {
    const { account, token } = await linkFor();
    const second = await login(creds.password);
    await reset(token);
    for (const session of [account, second]) {
      const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${session.body.accessToken}`);
      assert.equal(me.status, 401);
      const cookie = session.headers['set-cookie'].find((c) => c.startsWith('mm_rt=')).split(';')[0];
      assert.equal((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status, 401);
    }
  });

  it('works only once, even when used twice at the same moment', async () => {
    const { token } = await linkFor();
    const results = await Promise.all([reset(token, 'firstchoice1'), reset(token, 'secondchoice2')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [204, 400]);
    assert.equal((await reset(token, 'thirdchoice3')).body.error.code, 'RESET_LINK_INVALID');
  });

  it('refuses an expired or made-up link and leaves the password alone', async () => {
    const { token } = await linkFor();
    await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    for (const bad of [token, 'made-up-token']) {
      const res = await reset(bad);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'RESET_LINK_INVALID');
    }
    assert.equal((await login(creds.password)).status, 200);
  });

  it('rejects a weak password without using up the link', async () => {
    const { token } = await linkFor();
    const weak = await reset(token, 'short');
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.details.fields.password);
    assert.equal((await reset(token)).status, 204);
  });

  it('only changes the account the link was made for', async () => {
    await register({ ...creds, email: 'grace@example.com' });
    const { token } = await linkFor();
    await reset(token);
    assert.equal((await login(creds.password, 'grace@example.com')).status, 200);
  });

  it('changing the password in Settings cancels an outstanding link', async () => {
    const { account, token } = await linkFor();
    const changed = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${account.body.accessToken}`)
      .send({ currentPassword: creds.password, newPassword: 'chosen-in-settings1' });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((await reset(token)).body.error.code, 'RESET_LINK_INVALID');
  });

  it('deleting the account removes its link', async () => {
    const { account, token } = await linkFor();
    const gone = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${account.body.accessToken}`).send({ password: creds.password, confirm: 'DELETE' });
    assert.equal(gone.status, 204);
    assert.equal(await PasswordReset.countDocuments(), 0);
    assert.equal((await reset(token)).status, 400);
  });
});

describe('SMTP delivery', () => {
  it('requires encryption for remote servers and picks TLS from the port', () => {
    const starttls = smtpOptions({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' });
    assert.deepEqual([starttls.port, starttls.secure, starttls.requireTLS], [587, false, true]);
    assert.deepEqual(starttls.auth, { user: 'u', pass: 'p' });
    const tls = smtpOptions({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: 465 });
    assert.deepEqual([tls.secure, tls.requireTLS, tls.auth], [true, false, undefined]);
    assert.equal(smtpOptions({ SMTP_HOST: 'localhost', SMTP_PORT: 1025 }).requireTLS, false);
  });

  it('delivers the email to a mail server', async () => {
    // A minimal local mail server, enough to receive one message over real SMTP.
    let received = '';
    const server = net.createServer((socket) => {
      let inData = false;
      let buffer = '';
      socket.write('220 test\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              socket.write('250 stored\r\n');
            } else received += `${line}\n`;
          } else if (line === 'DATA') {
            inData = true;
            socket.write('354 go ahead\r\n');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 ok\r\n');
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const transport = nodemailer.createTransport(smtpOptions({ SMTP_HOST: '127.0.0.1', SMTP_PORT: server.address().port }));
    try {
      await transport.sendMail({ from: 'Mindmesh <no-reply@example.com>', to: 'ada@example.com', ...passwordResetEmail({ link: 'http://localhost:5173/reset-password#token=abc', minutes: 30 }) });
    } finally {
      transport.close();
      server.close();
    }
    assert.match(received, /Subject: Reset your Mindmesh password/);
    assert.match(received, /To: ada@example\.com/);
    assert.match(received, /expires in 30 minutes/);
  });
});

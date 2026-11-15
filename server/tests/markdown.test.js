import './setup-env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { docToMarkdown, noteToMarkdownFile, slugFilename } from '../src/processing/docToMarkdown.js';
import { markdownToDoc } from '../src/processing/markdownToDoc.js';
import { waitForIdle } from '../src/processing/queue.js';
import { parseSse, sseParser, useFakeProviders } from './fakeProviders.js';
import { doc, makeUser, startTestApp } from './helpers.js';

const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}) });
const p = (...c) => ({ type: 'paragraph', content: c });
const d = (...c) => ({ type: 'doc', content: c });

describe('docToMarkdown', () => {
  it('converts headings, marks and links', () => {
    const md = docToMarkdown(
      d(
        { type: 'heading', attrs: { level: 2 }, content: [t('Plan')] },
        p(t('Some '), t('bold', 'bold'), t(' and '), t('italic', 'italic'), t(' and '), t('code', 'code'), t(' and '), t('site', { type: 'link', attrs: { href: 'https://x.org/a b' } }), t('.'))
      )
    );
    assert.equal(md, '## Plan\n\nSome **bold** and *italic* and `code` and [site](https://x.org/a%20b).');
  });

  it('keeps whitespace outside emphasis markers and drops unsafe links', () => {
    assert.equal(docToMarkdown(d(p(t('a'), t(' spaced ', 'bold'), t('b')))), 'a **spaced** b');
    assert.equal(docToMarkdown(d(p(t('click', { type: 'link', attrs: { href: 'javascript:alert(1)' } })))), 'click');
  });

  it('escapes text that would otherwise become formatting', () => {
    assert.equal(docToMarkdown(d(p(t('2 * 3 = 6, snake_case, [x], <b>')))), '2 \\* 3 = 6, snake\\_case, \\[x\\], \\<b>');
    assert.equal(docToMarkdown(d(p(t('# not a heading')))), '\\# not a heading');
    assert.equal(docToMarkdown(d(p(t('1. not a list')))), '\\1. not a list');
  });

  it('handles lists, nesting, quotes, code and rules', () => {
    const li = (...c) => ({ type: 'listItem', content: c });
    const md = docToMarkdown(
      d(
        { type: 'bulletList', content: [li(p(t('one')), { type: 'bulletList', content: [li(p(t('nested')))] }), li(p(t('two')))] },
        { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('third')))] },
        { type: 'blockquote', content: [p(t('quoted')), p(t('again'))] },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [t('const a = `x`;\n```')] },
        { type: 'horizontalRule' }
      )
    );
    assert.equal(md, '- one\n  - nested\n- two\n\n3. third\n\n> quoted\n>\n> again\n\n````js\nconst a = `x`;\n```\n````\n\n---');
  });

  it('round-trips through markdownToDoc', () => {
    const original = d(
      { type: 'heading', attrs: { level: 2 }, content: [t('Title')] },
      p(t('Hello '), t('world', 'bold')),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a'))] }, { type: 'listItem', content: [p(t('b'))] }] },
      { type: 'codeBlock', attrs: { language: 'py' }, content: [t('print(1)')] }
    );
    const again = markdownToDoc(docToMarkdown(original));
    assert.deepEqual(again.content.map((n) => n.type), ['heading', 'paragraph', 'bulletList', 'codeBlock']);
    assert.equal(docToMarkdown(again), docToMarkdown(original));
  });

  it('builds a full file with title and tags, and safe filenames', () => {
    assert.equal(noteToMarkdownFile({ title: ' My  Note ', tags: ['a', 'b'], content: d(p(t('Body'))) }), '# My Note\n\n*Tags: a, b*\n\nBody\n');
    assert.equal(noteToMarkdownFile({ title: 'Empty', content: d({ type: 'paragraph' }) }), '# Empty\n\n');
    assert.equal(slugFilename('Café: "Notes" / 2026!'), 'cafe-notes-2026.md');
    assert.equal(slugFilename('../../etc/passwd'), 'etc-passwd.md');
    assert.equal(slugFilename('???'), 'untitled.md');
  });
});

let ctx;
before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await waitForIdle();
  await ctx.stop();
});
beforeEach(async () => {
  await waitForIdle();
  await ctx.reset();
  useFakeProviders();
});

describe('Markdown downloads', () => {
  it('downloads a note as a Markdown file, for its owner only, and only notes', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    const note = (
      await u.post('/api/resources/notes', {
        title: 'Lecture: Week 1',
        tags: ['math'],
        content: d({ type: 'heading', attrs: { level: 2 }, content: [t('Limits')] }, p(t('Epsilon-delta', 'bold'))),
      })
    ).body.resource;
    const res = await u.get(`/api/resources/${note.id}/markdown`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/markdown/);
    assert.equal(res.headers['content-disposition'], 'attachment; filename="lecture-week-1.md"');
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.equal(res.text, '# Lecture: Week 1\n\n*Tags: math*\n\n## Limits\n\n**Epsilon-delta**\n');

    assert.equal((await other.get(`/api/resources/${note.id}/markdown`)).status, 404);
    assert.equal((await request(ctx.app).get(`/api/resources/${note.id}/markdown`)).status, 401);
    const link = (await u.post('/api/resources/links', { url: 'https://example.invalid/x' })).body.resource;
    const bad = await u.get(`/api/resources/${link.id}/markdown`);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /Only notes/);
  });

  it('downloads a conversation with its sources, for its owner only', async () => {
    const u = await makeUser(ctx.app);
    const other = await makeUser(ctx.app);
    await u.post('/api/resources/notes', { title: 'Backpropagation', content: doc('Backpropagation computes gradients that flow backwards through network layers.') });
    await waitForIdle();
    const conv = (await u.post('/api/conversations', {})).body.conversation;
    assert.equal((await u.get(`/api/conversations/${conv.id}/export`)).status, 400, 'empty conversations have nothing to download');

    parseSse(
      (
        await request(ctx.app)
          .post(`/api/conversations/${conv.id}/messages`)
          .set(u.auth)
          .send({ content: 'How do gradients flow backwards through network layers?', mode: 'knowledge', clientRequestId: crypto.randomUUID() })
          .buffer(true)
          .parse(sseParser)
      ).body
    );
    const res = await u.get(`/api/conversations/${conv.id}/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /attachment; filename="[a-z0-9-]+\.md"/);
    assert.match(res.text, /^# /);
    assert.match(res.text, /## You · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC · My Knowledge/);
    assert.match(res.text, /How do gradients flow backwards/);
    assert.match(res.text, /## Mindmesh · /);
    assert.match(res.text, /\*\*Sources\*\*\n\n1\. Backpropagation/);

    assert.equal((await other.get(`/api/conversations/${conv.id}/export`)).status, 404);
  });
});

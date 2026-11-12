import './setup-env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSegments, normaliseText, CHUNK_TARGET, CHUNK_MAX } from '../src/processing/chunker.js';
import { isPrivateAddress, robotsAllows } from '../src/processing/linkFetcher.js';
import { docToSegments, sanitizeDoc } from '../src/processing/noteContent.js';
import { markdownSegments, htmlToText } from '../src/processing/extractors.js';

describe('chunker', () => {
  it('packs paragraphs near the target size with overlap and page ranges', () => {
    const para = (n) => `Paragraph ${n}. ${'Lorem ipsum dolor sit amet. '.repeat(12)}`;
    const segments = [1, 2, 3].map((page) => ({ page, text: [para(page * 10 + 1), para(page * 10 + 2), para(page * 10 + 3)].join('\n\n') }));
    const chunks = chunkSegments(segments);
    assert.ok(chunks.length >= 3);
    for (const c of chunks) assert.ok(c.charCount <= CHUNK_TARGET + CHUNK_MAX, `chunk too large: ${c.charCount}`);
    assert.equal(chunks[0].page, 1);
    assert.equal(chunks.at(-1).pageEnd, 3);
    assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
  });

  it('splits a giant paragraph by sentence and hard-wraps a giant sentence', () => {
    const chunks = chunkSegments([{ text: `${'word '.repeat(2000)}. ${'Sentence here. '.repeat(300)}` }]);
    assert.ok(chunks.length > 3);
    assert.ok(chunks.every((c) => c.text.length < 4000));
  });

  it('normalises whitespace, control characters and hyphenation', () => {
    assert.equal(normaliseText('learn-\ning  is\u0000 fun\r\n\n\n\nok'), 'learning is fun\n\nok');
    assert.deepEqual(chunkSegments([{ text: '   \n\n ' }]), []);
  });
});

describe('note content', () => {
  it('derives heading-scoped segments from TipTap JSON', () => {
    const d = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Intro' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
      ],
    };
    const segs = docToSegments(d);
    assert.deepEqual(segs.map((s) => s.heading), ['Intro', 'Next']);
    assert.match(segs[0].text, /• item/);
  });

  it('rejects deeply nested or invalid documents', () => {
    let deep = { type: 'paragraph' };
    for (let i = 0; i < 60; i++) deep = { type: 'blockquote', content: [deep] };
    assert.throws(() => sanitizeDoc({ type: 'doc', content: [deep] }));
    assert.throws(() => sanitizeDoc({ type: 'nope' }));
  });
});

describe('extractors', () => {
  it('scopes markdown by headings and ignores # inside code fences', () => {
    const segs = markdownSegments('# Title\nintro\n```\n# not a heading\n```\n## Part two\nbody');
    assert.deepEqual(segs.map((s) => s.heading), ['Title', 'Part two']);
  });

  it('drops scripts and navigation from HTML', () => {
    const text = htmlToText('<html><body><nav>menu</nav><main><p>Real content</p><script>evil()</script></main></body></html>');
    assert.equal(text, 'Real content');
  });
});

describe('link safety', () => {
  it('classifies private and public addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  });

  it('evaluates robots.txt with longest-match rules', () => {
    const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: OtherBot\nDisallow: /';
    assert.equal(robotsAllows(robots, '/public'), true);
    assert.equal(robotsAllows(robots, '/private/x'), false);
    assert.equal(robotsAllows(robots, '/private/open/page'), true);
    assert.equal(robotsAllows('User-agent: MindmeshBot\nDisallow: /', '/anything'), false);
    assert.equal(robotsAllows('', '/x'), true);
  });
});

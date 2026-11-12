/**
 * Automated UI check: every main page × all three themes × four viewport widths.
 * Reports horizontal overflow (with the offending elements), browser console errors and
 * failed requests, and saves screenshots for visual review.
 *
 * Usage (with `npm run dev` running):
 *   npm run check:ui
 * Options (env): UI_BASE (default http://localhost:5173), UI_BROWSER (msedge | chrome | path),
 *                UI_OUT (screenshot folder, default ./ui-report), UI_THEMES, UI_WIDTHS.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const AXE_SOURCE = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.UI_BASE || 'http://localhost:5173';
const OUT = path.resolve(process.env.UI_OUT || 'ui-report');
const THEMES = (process.env.UI_THEMES || 'library,studio,lab').split(',');
const WIDTHS = (process.env.UI_WIDTHS || '1440,1024,768,390').split(',').map(Number);
const HEIGHT = { 1440: 900, 1024: 768, 768: 1024, 390: 844 };
const browserOpt = process.env.UI_BROWSER || 'msedge';

const api = async (method, p, body, token, isForm) => {
  const res = await fetch(`${BASE}/api${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const doc = (...paras) => ({ type: 'doc', content: paras.map((t) => (typeof t === 'string' ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : t)) });

async function seed() {
  const email = `ui-check-${Date.now()}@example.com`;
  const password = 'mindmesh1';
  const { accessToken: token } = await api('POST', '/auth/register', { name: 'Ada Lovelace', email, password });
  await api('POST', '/users/me/onboarding', { theme: 'library', interests: ['Machine learning', 'History', 'Design', 'Neuroscience'], defaultMode: 'knowledge' }, token);
  const col = (await api('POST', '/collections', { name: 'Research', description: 'Papers and notes for the thesis' }, token)).collection;
  await api('POST', '/collections', { name: 'Neural networks', parentId: col.id }, token);
  const notes = [];
  notes.push(
    (
      await api(
        'POST',
        '/resources/notes',
        {
          title: 'How backpropagation works',
          collectionId: col.id,
          tags: ['machine learning', 'math'],
          content: doc(
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The chain rule' }] },
            'Backpropagation computes gradients layer by layer, flowing backwards from the loss.',
            { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Learning is just repeated small corrections.' }] }] },
            { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'loss.backward()\noptimizer.step()' }] }
          ),
        },
        token
      )
    ).resource
  );
  notes.push((await api('POST', '/resources/notes', { title: 'The printing press and the spread of ideas', tags: ['history'], pinned: true, content: doc('Gutenberg’s press in 1440 made books cheap and fast to produce.') }, token)).resource);
  notes.push((await api('POST', '/resources/notes', { title: 'Design principles worth remembering', tags: ['design'], content: doc('Whitespace is a tool, not empty space. Hierarchy guides the eye.') }, token)).resource);
  const form = new FormData();
  form.append('file', new Blob(['Neurons communicate through synapses. Memory formation involves the hippocampus.'], { type: 'text/plain' }), 'neuroscience-primer.txt');
  form.append('tags', JSON.stringify(['neuroscience']));
  const docRes = (await api('POST', '/resources/documents', form, token, true)).resource;
  await api('POST', '/graph/connections', { sourceId: notes[0].id, targetId: notes[2].id, label: 'related idea' }, token);
  await api('POST', '/search/recent', { query: 'how computers learn', resultCount: 1 }, token);
  await api('POST', '/conversations', { title: 'Backprop questions' }, token);
  await new Promise((r) => setTimeout(r, 1500));
  return { email, password, token, noteId: notes[0].id, docId: docRes.id };
}

const PAGES = (s) => [
  { name: 'home', path: '/' },
  { name: 'vault', path: '/vault' },
  { name: 'note', path: `/vault/${s.noteId}` },
  { name: 'document', path: `/vault/${s.docId}` },
  { name: 'collections', path: '/collections' },
  { name: 'assistant', path: '/assistant' },
  { name: 'search', path: '/search?q=backpropagation' },
  { name: 'graph', path: '/graph' },
  { name: 'timeline', path: '/timeline' },
  { name: 'settings', path: '/settings/ai' },
];

const OVERFLOW_PROBE = () => {
  const w = window.innerWidth;
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - w;
  const offenders = [];
  if (overflow > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') {
        // Skip children of horizontally scrollable containers (intended scrolling).
        let p = el.parentElement;
        let scrollable = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') {
            scrollable = true;
            break;
          }
          p = p.parentElement;
        }
        if (!scrollable) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (right ${Math.round(r.right)})`);
      }
      if (offenders.length > 5) break;
    }
  }
  return { overflow, offenders };
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const s = await seed();
  const launch = browserOpt.includes('/') || browserOpt.includes('\\') ? { executablePath: browserOpt } : { channel: browserOpt };
  const browser = await chromium.launch({ ...launch, headless: true });
  const results = [];

  // One signed-in session for everything (sign-in is rate-limited, and refresh tokens rotate).
  const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT[WIDTHS[0]] || 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => (r.status() >= 500 || r.status() === 429) && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', s.email);
  await page.fill('input[type=password]', s.password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

  for (const theme of THEMES) {
    await api('PATCH', '/users/me/preferences', { theme }, s.token);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT[width] || 900 });
      for (const pg of PAGES(s)) {
        errors.length = 0;
        await page.goto(`${BASE}${pg.path}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(600);
        const { overflow, offenders } = await page.evaluate(OVERFLOW_PROBE);
        await page.screenshot({ path: path.join(OUT, `${theme}-${pg.name}-${width}.png`) });
        // Accessibility (axe-core, WCAG 2.1 A/AA) at the widest size for each theme.
        let a11y = [];
        if (width === WIDTHS[0]) {
          await page.addScriptTag({ content: AXE_SOURCE });
          a11y = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
            return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
          });
        }
        results.push({ theme, width, page: pg.name, overflow, offenders, errors: [...errors], a11y });
      }
    }
  }
  await context.close();

  // The signed-out sign-in page in each theme (theme comes from the visitor's saved choice).
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const visitor = await browser.newContext({ viewport: { width, height: HEIGHT[width] || 900 } });
      await visitor.addInitScript((t) => localStorage.setItem('mm.theme', t), theme);
      const p = await visitor.newPage();
      await p.goto(`${BASE}/login`);
      await p.waitForTimeout(500);
      const { overflow, offenders } = await p.evaluate(OVERFLOW_PROBE);
      await p.screenshot({ path: path.join(OUT, `${theme}-login-${width}.png`) });
      results.push({ theme, width, page: 'login', overflow, offenders, errors: [] });
      await visitor.close();
    }
  }
  await browser.close();

  const problems = results.filter((r) => r.overflow > 1 || r.errors.length || r.a11y?.length);
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify({ checked: results.length, problems }, null, 2));
  console.log(`Checked ${results.length} page views (${THEMES.length} themes × ${WIDTHS.length} widths × ${PAGES(s).length + 1} pages).`);
  if (!problems.length) console.log('No horizontal overflow, no console errors and no serious accessibility violations.');
  for (const p of problems) {
    console.log(`✖ ${p.theme} ${p.page} @${p.width}px${p.overflow > 1 ? ` overflow ${p.overflow}px ${p.offenders.join(' | ')}` : ''}${p.errors.length ? ` errors: ${p.errors.join(' | ')}` : ''}${p.a11y?.length ? ` a11y: ${p.a11y.join(' | ')}` : ''}`);
  }
  console.log(`Screenshots: ${OUT}`);
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

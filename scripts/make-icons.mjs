/**
 * Renders the Mindmesh mark into the PNG icons used by the installable app (PWA).
 * Run only when the logo changes:  node scripts/make-icons.mjs
 * Needs Microsoft Edge or Chrome (same as `npm run check:ui`); set UI_BROWSER to pick one.
 *
 * Output (client/public/icons):
 *   icon-192.png, icon-512.png   rounded tile, for the home screen / app list
 *   icon-maskable-512.png        full-bleed square with extra padding, so Android can crop it to any shape
 *   apple-touch-icon.png         180px full-bleed square (iOS rounds the corners itself)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = path.resolve('client/public/icons');
const INK = '#1d1b26';

// The mark is drawn on a 32x32 grid, the same one used by favicon.svg.
const MARK = `<g stroke="#4fe0c8" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21 16 10l7 11M9 21h14"/></g><g fill="#f4c95d"><circle cx="16" cy="10" r="2.6"/><circle cx="9" cy="21" r="2.6"/><circle cx="23" cy="21" r="2.6"/></g>`;

/** `scale` shrinks the mark towards the centre (1 = as in the favicon). */
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <rect width="32" height="32" ${rounded ? 'rx="7"' : ''} fill="${INK}"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -15.5)">${MARK}</g>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1.15 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1.15 },
  // Maskable icons must keep the important part inside the central 80% circle.
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.95 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 1.0 },
];

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.UI_BROWSER || 'msedge', headless: true });
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(icon)}`);
  await page.screenshot({ path: path.join(OUT, icon.file), omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
  await page.close();
  console.log('wrote', icon.file);
}
await browser.close();

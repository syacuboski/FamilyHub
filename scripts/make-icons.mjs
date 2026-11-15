// Renders public/icons/icon.svg to the PNG sizes the PWA manifest and iOS need.
// Usage: npm run icons   (uses Playwright's Chromium: npx playwright install chromium)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['badge-72.png', 72, false],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, fullBleed] of targets) {
  await page.setViewportSize({ width: size, height: size });
  // maskable / apple icons: square, no rounded corners, art inset for the safe zone
  const art = fullBleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  const inner = fullBleed ? `<div style="width:100%;height:100%;background:#0E1330;display:flex;align-items:center;justify-content:center"><div style="width:80%;height:80%">${art.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>` : art.replace('<svg ', '<svg width="100%" height="100%" ');
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.screenshot({ path: out(name), omitBackground: !fullBleed });
  console.log('wrote', name);
}
await browser.close();

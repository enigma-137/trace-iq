// Captures real dashboard screens from a local, seeded TraceIQ instance for
// the promo video. Run seed-demo.mjs first.
//
// Usage: node video/capture.mjs [dashboardUrl] [apiUrl]

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = process.argv[3] ?? 'http://localhost:4000';
const OUT = new URL('./public/shots/', import.meta.url).pathname;

const PAGES = [
  ['overview', '/dashboard'],
  ['web', '/dashboard/web'],
  ['funnels', '/dashboard/funnels'],
  ['retention', '/dashboard/retention'],
  ['users', '/dashboard/users'],
  ['errors', '/dashboard/errors'],
  ['logs', '/dashboard/logs'],
  ['api-performance', '/dashboard/api-performance'],
  ['requests', '/dashboard/requests']
];

// Local single-user mode shows a warning banner and the dashboard shows a
// promo card; neither belongs in a product video.
async function tidy(page) {
  await page.evaluate(() => {
    // Hide the outermost element that holds only the unwanted content, so the
    // page layout around it is untouched.
    const hide = (matches) => {
      const hits = [...document.querySelectorAll('body *')].filter((el) => matches(el.textContent ?? ''));
      const deepest = hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)));
      for (let el of deepest) {
        while (el.parentElement && matches(el.parentElement.textContent ?? '') &&
          el.parentElement.textContent.trim().length === el.textContent.trim().length) el = el.parentElement;
        el.style.display = 'none';
      }
    };
    hide((text) => text.includes('Local single-user mode') && text.includes('your own machine') && text.length < 300);
    hide((text) => text.includes('See what users actually do') && text.includes('Maybe later') && text.length < 400);
  });
}

// The saved funnel's own page has the step-by-step chart.
const { funnels } = await (await fetch(`${API}/v1/dashboard/funnels?projectId=proj_local`)).json();
if (funnels?.[0]) PAGES.push(['funnel', `/dashboard/funnels/${funnels[0].id}`]);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });

for (const [name, path] of PAGES) {
  // Live pages (logs) stream forever, so never reach networkidle.
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await tidy(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`captured ${name}`);
}

await browser.close();

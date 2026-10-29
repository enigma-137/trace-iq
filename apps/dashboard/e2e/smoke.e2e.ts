import { expect, test, type Page } from '@playwright/test';

/**
 * Public pages must render on the server (HTTP 200) and in the browser
 * without uncaught errors. Guards against regressions like /docs returning 500
 * when a client module became async, which went unnoticed because the page
 * still rendered after hydration.
 */
const PUBLIC_PAGES = ['/', '/demo', '/demo/funnels', '/demo/requests', '/pricing', '/docs?page=welcome', '/docs?page=quickstart', '/docs?page=cli', '/docs?page=logs'];

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Network failures (e.g. no API in CI) and browser CSP noise are not page bugs.
    if (/Failed to load resource|Content Security Policy|net::ERR_/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

for (const path of PUBLIC_PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(path, { waitUntil: 'networkidle' });

    expect(response?.status(), `${path} should render on the server`).toBe(200);
    expect(errors, `${path} should not log errors`).toEqual([]);
  });
}

/** Relative luminance (0 = black, 1 = white) of a computed CSS color. */
function luminance(color: string): number {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map((v) => Number(v) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('traceiq-theme', 'dark'));
  });

  test('docs surfaces are dark with light text', async ({ page }) => {
    await page.goto('/docs?page=cli', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveClass(/dark/);

    const header = page.locator('header').first();
    const heading = page.getByRole('heading', { name: 'CLI', exact: true });
    const headerBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
    const headingColor = await heading.evaluate((el) => getComputedStyle(el).color);

    expect(luminance(headerBg)).toBeLessThan(0.1);
    expect(luminance(headingColor)).toBeGreaterThan(0.6);
  });

  test('custom shades used by dark-mode classes exist in the stylesheet', async ({ page }) => {
    await page.goto('/docs?page=welcome', { waitUntil: 'networkidle' });

    // A class whose color Tailwind does not know generates no CSS at all, so
    // light backgrounds show through in dark mode (this happened with neutral-850).
    const hasRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule.cssText.includes('.dark\\:bg-neutral-850')) return true;
          }
        } catch {
          // cross-origin stylesheet
        }
      }
      return false;
    });

    expect(hasRule).toBe(true);
  });
});

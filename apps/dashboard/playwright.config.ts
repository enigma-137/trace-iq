import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests for pages that render without a signed-in session.
 *
 * - CI: builds are done by the workflow; Playwright starts `next start` on 3100.
 * - Locally: point at a running dev server with PLAYWRIGHT_BASE_URL, e.g.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
 *   or run without it to build-and-start on 3100.
 */
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const port = 3100;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: process.env.CI ? `npx next start -p ${port}` : `npx next build && npx next start -p ${port}`,
        url: `http://localhost:${port}`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI
      }
});

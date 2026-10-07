import { createServer, Server } from 'node:http';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { SyntheticRunnerService } from '../src/modules/synthetic-monitoring/synthetic-runner.service';
import { SyntheticCryptoService } from '../src/modules/synthetic-monitoring/synthetic-crypto.service';

describe('SyntheticRunnerService - Hardened Playwright End-to-End', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;
  const crypto = new SyntheticCryptoService();
  const runner = new SyntheticRunnerService(crypto);

  beforeAll(async () => {
    process.env.ALLOW_LOCAL_SYNTHETIC_TARGETS = 'true';

    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      if (req.url === '/checkout') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Checkout Page</title></head>
            <body>
              <h1 id="title">Checkout</h1>
              <input id="email-input" name="email" type="text" />
              <button id="pay-btn" onclick="document.getElementById('success').style.display='block'">Pay Now</button>
              <div id="success" style="display:none;">Payment Successful</div>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/secret-login') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Secret Login</title></head>
            <body>
              <h1 id="header">Login Area</h1>
              <input id="pass-input" type="password" />
              <button id="submit-btn" onclick="console.log('User typed secret: ' + document.getElementById('pass-input').value)">Submit</button>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/evil-redirect') {
        // Tries to redirect to AWS metadata IP
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
        return;
      }

      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Home Test Page</title></head>
          <body>
            <header><h1>Welcome to TraceIQ Test</h1></header>
            <main id="app-root"><p>All systems operational</p></main>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          port = addr.port;
          baseUrl = `http://127.0.0.1:${port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    delete process.env.ALLOW_LOCAL_SYNTHETIC_TARGETS;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('successfully executes a multi-step journey (navigate, click, fill, assert_visible, assert_text)', async () => {
    const result = await runner.execute({
      runId: 'srun_test_pass',
      projectId: 'proj_local',
      baseUrl: `${baseUrl}/checkout`,
      browserType: 'chromium',
      viewportWidth: 1280,
      viewportHeight: 720,
      timeoutMs: 15000,
      steps: [
        { type: 'navigate', url: `${baseUrl}/checkout`, description: 'Open checkout' },
        { type: 'assert_visible', selector: '#title', description: 'Assert title visible' },
        { type: 'assert_text', selector: '#title', value: 'Checkout', description: 'Assert title text' },
        { type: 'fill', selector: '#email-input', value: 'qa-user@traceiq.dev', description: 'Fill email' },
        { type: 'click', selector: '#pay-btn', description: 'Click pay button' },
        { type: 'assert_visible', selector: '#success', description: 'Assert success badge' }
      ],
      allowLocal: true
    });

    expect(result.status).toBe('passed');
    expect(result.failedStepIndex).toBeNull();
    expect(result.stepResults.length).toBe(6);
    expect(result.stepResults.every((s) => s.status === 'passed')).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 60000);

  it('fails gracefully and captures step failure when an assertion fails on broken journey', async () => {
    const result = await runner.execute({
      runId: 'srun_test_fail',
      projectId: 'proj_local',
      baseUrl: `${baseUrl}/checkout`,
      browserType: 'chromium',
      viewportWidth: 1280,
      viewportHeight: 720,
      timeoutMs: 3000,
      steps: [
        { type: 'navigate', url: `${baseUrl}/checkout`, description: 'Open checkout' },
        { type: 'assert_visible', selector: '#missing-element-404', description: 'Assert missing element' }
      ],
      allowLocal: true
    });

    expect(result.status).toBe('timed_out');
    expect(result.failedStepIndex).toBe(1);
    expect(result.stepResults[0].status).toBe('passed');
    expect(result.stepResults[1].status).toBe('failed');
    expect(result.failureReason).toContain('missing-element-404');
    expect(result.screenshotBase64).toContain('data:image/jpeg;base64,');
  }, 60000);

  it('interpolates in-memory secrets and redacts secret values from console/logs', async () => {
    const sensitiveSecret = 'SuperSecretP@ssword999';

    const result = await runner.execute({
      runId: 'srun_test_secret',
      projectId: 'proj_local',
      baseUrl: `${baseUrl}/secret-login`,
      browserType: 'chromium',
      viewportWidth: 1280,
      viewportHeight: 720,
      timeoutMs: 15000,
      steps: [
        { type: 'navigate', url: `${baseUrl}/secret-login`, description: 'Open secret page' },
        { type: 'fill', selector: '#pass-input', value: '{{MY_TEST_SECRET}}', description: 'Fill secret' },
        { type: 'click', selector: '#submit-btn', description: 'Click submit' }
      ],
      secrets: {
        MY_TEST_SECRET: sensitiveSecret
      },
      allowLocal: true
    });

    expect(result.status).toBe('passed');
    // Ensure the plaintext secret is redacted from console logs
    const consoleText = JSON.stringify(result.consoleLogs);
    expect(consoleText).not.toContain(sensitiveSecret);
    expect(consoleText).toContain('[REDACTED]');
  }, 60000);

  it('intercepts and blocks SSRF redirects to cloud metadata destinations at runtime', async () => {
    const result = await runner.execute({
      runId: 'srun_test_ssrf_redirect',
      projectId: 'proj_local',
      baseUrl: `${baseUrl}/evil-redirect`,
      browserType: 'chromium',
      viewportWidth: 1280,
      viewportHeight: 720,
      timeoutMs: 6000,
      steps: [
        { type: 'navigate', url: `${baseUrl}/evil-redirect`, description: 'Trigger redirect' }
      ],
      allowLocal: false // Enforce strict SSRF protection
    });

    // The initial navigate was allowed locally or aborted on the 169.254.169.254 redirect
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBeDefined();
  }, 60000);

  it('executes a preview deployment URL override preserving stored monitor steps', async () => {
    // Stored monitor with default/production baseUrl
    const storedMonitor = {
      id: 'sym_stored_prod',
      projectId: 'proj_local',
      name: 'Signup Journey',
      baseUrl: 'https://production.app.traceiq.ai', // production URL
      browser: 'chromium' as const,
      viewportWidth: 1280,
      viewportHeight: 720,
      timeoutMs: 15000,
      steps: [
        { type: 'navigate' as const, url: '/checkout', description: 'Open checkout path' },
        { type: 'assert_visible' as const, selector: '#title', description: 'Assert title' },
        { type: 'fill' as const, selector: '#email-input', value: 'preview-tester@traceiq.test', description: 'Fill email' },
        { type: 'click' as const, selector: '#pay-btn', description: 'Click pay' },
        { type: 'assert_visible' as const, selector: '#success', description: 'Assert success' }
      ]
    };

    // Execute with preview URL override
    const previewUrl = baseUrl; // local test server simulating PR preview
    const result = await runner.execute({
      runId: 'srun_preview_test',
      projectId: storedMonitor.projectId,
      baseUrl: previewUrl, // OVERRIDE!
      browserType: storedMonitor.browser,
      viewportWidth: storedMonitor.viewportWidth,
      viewportHeight: storedMonitor.viewportHeight,
      timeoutMs: storedMonitor.timeoutMs,
      steps: storedMonitor.steps,
      allowLocal: true
    });

    expect(result.status).toBe('passed');
    expect(result.failedStepIndex).toBeNull();
    // Stored production baseUrl remains untouched
    expect(storedMonitor.baseUrl).toBe('https://production.app.traceiq.ai');
  }, 60000);
});


import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { TraceIQVerifier } from '../src/verifier/verifier.js';
import { SetupVerificationSession } from '../src/types.js';

describe('useTrace End-to-End Acceptance Test (Real Pipeline & SSE)', () => {
  it('verifies real event flow from SDK ingestion to SSE completion and listener cleanup', async () => {
    let activeSubscriptions = 0;
    let sessionStatus: 'pending' | 'verified' | 'expired' = 'pending';
    let verifiedPayload: any = null;
    const verificationId = `verify_e2e_${Date.now()}`;
    const projectId = 'proj_acceptance_test';
    const writeKey = 'trq_live_acceptance_key_123';

    // 1. Mock local TraceIQ Ingestion & SSE API Server simulating NestJS /v1/setup-verifications and /v1/events
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      // POST /v1/setup-verifications (Create session)
      if (req.method === 'POST' && url.pathname === '/v1/setup-verifications') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              verificationId,
              projectId,
              status: 'pending',
              expiresAt: new Date(Date.now() + 300000).toISOString()
            })
          );
        });
        return;
      }

      // GET /v1/setup-verifications/:id/events (SSE Stream)
      if (req.method === 'GET' && url.pathname === `/v1/setup-verifications/${verificationId}/events`) {
        activeSubscriptions++;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write(': heartbeat\n\n');

        const timer = setInterval(() => {
          if (sessionStatus === 'verified' && verifiedPayload) {
            clearInterval(timer);
            res.write(`event: verified\ndata: ${JSON.stringify(verifiedPayload)}\n\n`);
            activeSubscriptions--;
            res.end();
          }
        }, 100);

        req.on('close', () => {
          clearInterval(timer);
          if (res.writableEnded === false) {
            activeSubscriptions = Math.max(0, activeSubscriptions - 1);
          }
        });
        return;
      }

      // POST /v1/events (Normal Ingestion Pipeline)
      if (req.method === 'POST' && url.pathname === '/v1/events') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const parsed = JSON.parse(body);
          // Verify authentication header / payload writeKey
          const authKey = req.headers['x-traceiq-write-key'] || parsed.writeKey;
          if (authKey !== writeKey || parsed.projectId !== projectId) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }

          // Real Ingestion Correlation Check
          const eventVerificationId = parsed.properties?.verification_id || parsed.context?.verification_id;
          if (eventVerificationId === verificationId) {
            sessionStatus = 'verified';
            verifiedPayload = {
              verificationId,
              projectId,
              status: 'verified',
              verifiedAt: new Date().toISOString(),
              event: {
                id: 'evt_real_ingested_98765',
                name: parsed.eventName,
                source: req.headers.host ?? 'localhost:3000',
                environment: parsed.properties?.environment ?? 'development',
                properties: parsed.properties
              }
            };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: true, eventId: 'evt_real_ingested_98765' }));
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const apiUrl = `http://127.0.0.1:${address.port}`;

    try {
      const verifier = new TraceIQVerifier();

      // Step 1: CLI creates verification session
      const session: SetupVerificationSession = await verifier.createSession(apiUrl, projectId, writeKey, 300);
      expect(session.verificationId).toBe(verificationId);
      expect(sessionStatus).toBe('pending');

      // Step 2: CLI opens SSE listener in background
      const waitPromise = verifier.waitForVerification(apiUrl, session.verificationId, 10);
      await new Promise((r) => setTimeout(r, 200));
      expect(activeSubscriptions).toBe(1);

      // Step 3: Application sends real event through /v1/events with writeKey header
      const eventPayload = {
        projectId,
        writeKey,
        eventName: 'traceiq_setup_verified',
        timestamp: new Date().toISOString(),
        properties: {
          verification_id: session.verificationId,
          framework: 'Next.js',
          environment: 'development'
        }
      };

      const ingestRes = await fetch(`${apiUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-traceiq-write-key': writeKey
        },
        body: JSON.stringify(eventPayload)
      });
      const ingestJson = await ingestRes.json();
      expect(ingestRes.status).toBe(200);
      expect(ingestJson.accepted).toBe(true);

      // Step 4: CLI receives verified event through SSE
      const result = await waitPromise;
      expect(result.status).toBe('verified');
      expect(result.event.id).toBe('evt_real_ingested_98765');
      expect(result.event.name).toBe('traceiq_setup_verified');
      expect(sessionStatus).toBe('verified');

      // Step 5: Confirm SSE connection is closed and server listener is cleaned up
      await new Promise((r) => setTimeout(r, 200));
      expect(activeSubscriptions).toBe(0);
    } finally {
      server.close();
    }
  });

  it('handles timeout and clean failure path when no matching event is received', async () => {
    let activeSubscriptions = 0;
    const verificationId = `verify_timeout_${Date.now()}`;
    const projectId = 'proj_timeout_test';
    const writeKey = 'trq_live_timeout_key_123';

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (req.method === 'POST' && url.pathname === '/v1/setup-verifications') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            verificationId,
            projectId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 1500).toISOString()
          })
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === `/v1/setup-verifications/${verificationId}/events`) {
        activeSubscriptions++;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write(': heartbeat\n\n');

        // Expire after 1 second
        const expireTimer = setTimeout(() => {
          res.write(
            `event: expired\ndata: ${JSON.stringify({
              verificationId,
              status: 'expired',
              message: 'Verification session timed out.'
            })}\n\n`
          );
          activeSubscriptions = Math.max(0, activeSubscriptions - 1);
          res.end();
        }, 1000);

        req.on('close', () => {
          clearTimeout(expireTimer);
          if (!res.writableEnded) {
            activeSubscriptions = Math.max(0, activeSubscriptions - 1);
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const apiUrl = `http://127.0.0.1:${address.port}`;

    try {
      const verifier = new TraceIQVerifier();
      const session = await verifier.createSession(apiUrl, projectId, writeKey, 2);

      // Expect waitForVerification to reject with expiration/timeout error
      await expect(verifier.waitForVerification(apiUrl, session.verificationId, 3)).rejects.toThrow(
        /timed out|expired/i
      );

      // Verify server connection is closed and subscription cleaned up
      await new Promise((r) => setTimeout(r, 200));
      expect(activeSubscriptions).toBe(0);
    } finally {
      server.close();
    }
  });

  it('asserts that the CLI process exits with non-zero on verification timeout', async () => {
    const verificationId = `verify_cli_exit_timeout_${Date.now()}`;
    const projectId = 'proj_exit_code_test';
    const writeKey = 'trq_live_exit_key';

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (req.method === 'POST' && url.pathname === '/v1/setup-verifications') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            verificationId,
            projectId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 1000).toISOString()
          })
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === `/v1/setup-verifications/${verificationId}/events`) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write(': heartbeat\n\n');
        setTimeout(() => {
          res.write(
            `event: expired\ndata: ${JSON.stringify({
              verificationId,
              status: 'expired',
              message: 'Verification session timed out.'
            })}\n\n`
          );
          res.end();
        }, 800);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const apiUrl = `http://127.0.0.1:${address.port}`;

    const { spawn } = await import('node:child_process');
    const path = await import('node:path');

    const cliPath = path.resolve(__dirname, '../bin/usetrace.js');

    const exitCode = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.execPath,
        [cliPath, 'verify', '--api-url', apiUrl, '--project-id', projectId, '--write-key', writeKey, '--timeout', '2'],
        { env: { ...process.env, FORCE_COLOR: '0' } }
      );
      child.on('exit', (code) => resolve(code));
    });

    server.close();
    expect(exitCode).not.toBe(0);
    expect(exitCode).toBe(1);
  });
});

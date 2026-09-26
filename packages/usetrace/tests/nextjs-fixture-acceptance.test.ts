import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { BrowserTraceIQClient } from 'traceiq-sdk-js';
import { TraceIQVerifier } from '../src/verifier/verifier.js';
import { SetupVerificationSession } from '../src/types.js';

describe('Next.js App Router Client Telemetry & Real Verification Fixture', () => {
  it('mounts provider in browser environment, emits telemetry to /v1/events, and completes live verification session', async () => {
    let receivedEvents: any[] = [];
    let activeSubscriptions = 0;
    let sessionStatus: 'pending' | 'verified' | 'expired' = 'pending';
    let verifiedPayload: any = null;
    const verificationId = `verify_nextjs_fixture_${Date.now()}`;
    const projectId = 'prj_unsaid_nextjs_prod';
    const writeKey = 'tiq_live_unsaid_write_key_889';

    // 1. Mock TraceIQ Ingestion & SSE API Server
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      // POST /v1/setup-verifications (Create session)
      if (req.method === 'POST' && url.pathname === '/v1/setup-verifications') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            verificationId,
            projectId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 300000).toISOString()
          })
        );
        return;
      }

      // GET /v1/setup-verifications/:id/events (SSE Stream for traceiq verify)
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
        }, 50);

        req.on('close', () => {
          clearInterval(timer);
          if (!res.writableEnded) {
            activeSubscriptions = Math.max(0, activeSubscriptions - 1);
          }
        });
        return;
      }

      // POST /v1/events (Real Ingestion Pipeline)
      if (req.method === 'POST' && url.pathname === '/v1/events') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const parsed = JSON.parse(body);
          receivedEvents.push(parsed);

          const authKey = req.headers['x-traceiq-write-key'] || parsed.writeKey;
          if (authKey !== writeKey || parsed.projectId !== projectId) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized write key or project ID' }));
            return;
          }

          // Live verification correlation
          if (sessionStatus === 'pending') {
            sessionStatus = 'verified';
            verifiedPayload = {
              verificationId,
              projectId,
              status: 'verified',
              verifiedAt: new Date().toISOString(),
              event: {
                id: `evt_${Date.now()}`,
                name: parsed.eventName,
                source: req.headers.host ?? 'localhost:3000',
                environment: parsed.context?.environment ?? 'development',
                properties: parsed.properties
              }
            };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: true, eventId: `evt_${Date.now()}` }));
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const apiUrl = `http://127.0.0.1:${address.port}`;

    // Set up browser mock globals using Object.defineProperty
    const mockWindow: any = {
      location: {
        href: 'http://localhost:3000/app',
        pathname: '/app',
        search: '',
        origin: 'http://localhost:3000'
      },
      document: {
        title: 'Unsaid - Anonymous Feedback',
        referrer: ''
      },
      innerWidth: 1440,
      innerHeight: 900,
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      history: {
        pushState: (_state: any, _unused: string, url?: string | URL | null) => {
          if (url && mockWindow.location) {
            mockWindow.location.href = String(url);
            mockWindow.location.pathname = String(url);
          }
        },
        replaceState: (_state: any, _unused: string, url?: string | URL | null) => {
          if (url && mockWindow.location) {
            mockWindow.location.href = String(url);
            mockWindow.location.pathname = String(url);
          }
        }
      }
    };

    Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: mockWindow.document, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'history', { value: mockWindow.history, configurable: true, writable: true });

    try {
      // Step 1: Start `traceiq-cli verify`
      const verifier = new TraceIQVerifier();
      const session: SetupVerificationSession = await verifier.createSession(apiUrl, projectId, writeKey, 10);
      expect(session.verificationId).toBe(verificationId);
      expect(sessionStatus).toBe('pending');

      const verifyPromise = verifier.waitForVerification(apiUrl, session.verificationId, 10);

      // Step 2: Next.js Client App mounts Provider and initializes TraceIQ SDK
      const client = new BrowserTraceIQClient();
      client.initialize({
        projectId,
        writeKey,
        endpoint: apiUrl,
        autoTrackPageViews: true,
        autoCaptureExceptions: true,
        autoCaptureWebVitals: false
      });

      // Step 3: Wait for verification promise to resolve
      const verifiedResult = await verifyPromise;

      expect(verifiedResult.status).toBe('verified');
      expect(verifiedResult.event.name).toBe('$page');
      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);

      const firstEvent = receivedEvents[0];
      expect(firstEvent.projectId).toBe(projectId);
      expect(firstEvent.eventName).toBe('$page');
      expect(firstEvent.context).toBeDefined();
      expect(firstEvent.deviceInfo).toBeDefined();

      // Step 4: Next.js SPA Navigation using history.pushState
      mockWindow.history.pushState({}, '', 'http://localhost:3000/app/feedback');
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents[1].eventName).toBe('$page');
    } finally {
      delete (globalThis as any).window;
      delete (globalThis as any).document;
      delete (globalThis as any).history;
      server.close();
    }
  }, 10000);
});

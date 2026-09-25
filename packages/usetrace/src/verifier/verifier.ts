import http from 'node:http';
import https from 'node:https';
import { VerificationEventResult, VerificationSession } from '../types.js';

export class TraceIQVerifier {
  /**
   * Create a verification session on the TraceIQ backend.
   */
  async createSession(
    apiUrl: string,
    projectId: string,
    writeKey: string,
    ttlSeconds = 300
  ): Promise<VerificationSession> {
    const url = new URL('/v1/setup-verifications', apiUrl);
    const body = JSON.stringify({ projectId, writeKey, ttlSeconds });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-traceiq-write-key': writeKey
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create verification session (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { verificationId: string; expiresAt: string; projectId: string };
    return {
      verificationId: data.verificationId,
      expiresAt: data.expiresAt,
      projectId: data.projectId
    };
  }

  /**
   * Open a Server-Sent Events (SSE) stream and wait for the real verification event.
   */
  async waitForVerification(
    apiUrl: string,
    verificationId: string,
    timeoutSeconds = 300
  ): Promise<VerificationEventResult> {
    const streamUrl = new URL(`/v1/setup-verifications/${verificationId}/events`, apiUrl);

    return new Promise<VerificationEventResult>((resolve, reject) => {
      const isHttps = streamUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        streamUrl.toString(),
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`SSE stream failed with status ${res.statusCode}`));
            return;
          }

          let buffer = '';
          let currentEventName = 'message';

          res.setEncoding('utf8');

          res.on('data', (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? ''; // Keep incomplete trailing line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) {
                currentEventName = 'message';
                continue;
              }

              if (trimmed.startsWith(':')) {
                // SSE heartbeat comment
                continue;
              }

              if (trimmed.startsWith('event:')) {
                currentEventName = trimmed.slice(6).trim();
                continue;
              }

              if (trimmed.startsWith('data:')) {
                const dataRaw = trimmed.slice(5).trim();
                try {
                  const data = JSON.parse(dataRaw);
                  if (currentEventName === 'verified' || data.status === 'verified') {
                    cleanup();
                    resolve({
                      verificationId,
                      projectId: data.projectId ?? '',
                      projectName: data.projectName,
                      status: 'verified',
                      verifiedAt: data.verifiedAt ?? new Date().toISOString(),
                      event: data.event ?? { id: '', name: 'traceiq_setup_verified' }
                    });
                    return;
                  }

                  if (currentEventName === 'expired' || data.status === 'expired') {
                    cleanup();
                    reject(new Error(data.message ?? 'Verification session expired.'));
                    return;
                  }
                } catch {
                  // Non-JSON SSE line
                }
              }
            }
          });

          res.on('end', () => {
            cleanup();
            // If stream ended without verified event
            reject(new Error('Verification stream closed before receiving an event.'));
          });

          res.on('error', (err) => {
            cleanup();
            reject(err);
          });
        }
      );

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`No matching event was received within ${Math.round(timeoutSeconds / 60)} minutes.`));
      }, timeoutSeconds * 1000);

      const cleanup = () => {
        clearTimeout(timer);
        req.destroy();
      };

      req.on('error', (err) => {
        cleanup();
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Dispatch a real verification probe event through normal ingestion pipeline (/v1/events).
   */
  async dispatchProbe(
    apiUrl: string,
    projectId: string,
    writeKey: string,
    verificationId: string
  ): Promise<void> {
    const ingestUrl = new URL('/v1/events', apiUrl);
    const body = JSON.stringify({
      projectId,
      writeKey,
      eventName: 'traceiq_setup_verified',
      timestamp: new Date().toISOString(),
      properties: {
        verification_id: verificationId,
        source: 'usetrace-cli',
        environment: 'development'
      },
      context: {
        environment: 'development',
        verification_id: verificationId
      }
    });

    const response = await fetch(ingestUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-traceiq-write-key': writeKey
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ingest probe failed (${response.status}): ${text}`);
    }
  }
}

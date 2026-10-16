import { describe, expect, it, vi } from 'vitest';
import { BrowserTraceIQClient, normalizeApiPath } from '../src/core/client';

describe('browser request capture', () => {
  it('removes query strings and fragments from the groupable request path', () => {
    expect(
      normalizeApiPath(
        'https://api.example.test/users/123?access_token=canary-secret#private-fragment'
      )
    ).toBe('/users/:id');
  });

  it('does not put the raw request URL into the analytics event', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);

    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number): void;
    };
    capture.recordRequest(
      'GET',
      'https://api.example.test/users/123?access_token=canary-secret#private-fragment',
      200,
      12.6
    );

    expect(track).toHaveBeenCalledWith('$api_request', {
      method: 'GET',
      path: '/users/:id',
      status: 200,
      durationMs: 13,
      ok: true
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain('canary-secret');
    expect(JSON.stringify(track.mock.calls)).not.toContain('private-fragment');
  });
  it('records the echoed request id and response size when the backend exposes them', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number, response?: Response): void;
    };
    const response = {
      headers: new Headers({ 'x-request-id': 'req-abc-123', 'content-length': '512' })
    } as Response;

    capture.recordRequest('POST', 'https://api.example.test/orders', 201, 40, response);

    expect(track).toHaveBeenCalledWith('$api_request', {
      method: 'POST',
      path: '/orders',
      status: 201,
      durationMs: 40,
      ok: true,
      requestId: 'req-abc-123',
      responseSize: 512
    });
  });

  it('ignores a malformed echoed request id', () => {
    const client = new BrowserTraceIQClient();
    const track = vi.spyOn(client, 'track').mockImplementation(() => undefined);
    const capture = client as unknown as {
      recordRequest(method: string, url: string, status: number, durationMs: number, response?: Response): void;
    };
    const response = { headers: new Headers({ 'x-request-id': 'bad id <script>' }) } as Response;

    capture.recordRequest('GET', '/health', 200, 3, response);

    expect(track.mock.calls[0][1]).not.toHaveProperty('requestId');
  });
});

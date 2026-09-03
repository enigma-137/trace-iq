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
});

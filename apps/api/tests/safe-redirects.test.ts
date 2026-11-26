import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hostname -> address it "resolves" to. No real DNS in tests.
const dns: Record<string, string> = {
  'hooks.example.com': '93.184.216.34',
  'next.example.com': '93.184.216.35',
  'rebind.example.com': '10.0.0.7'
};

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    const address = dns[host];
    if (!address) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return [{ address, family: 4 }];
  })
}));

const { assertSafeFetchUrl, fetchWithSafeRedirects, isBlockedIpAddress } = await import('../src/common/url');

function redirect(status: number, location: string) {
  return new Response(null, { status, headers: { location } });
}

describe('fetchWithSafeRedirects', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('never lets fetch follow redirects on its own', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await fetchWithSafeRedirects('https://hooks.example.com/hook', { method: 'POST', body: '{}' });
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('refuses a redirect to a private address without requesting it', async () => {
    fetchMock.mockResolvedValueOnce(redirect(302, 'http://169.254.169.254/latest/meta-data/'));
    await expect(
      fetchWithSafeRedirects('https://hooks.example.com/hook', { method: 'POST', body: '{}' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to a public hostname that resolves to a private address', async () => {
    fetchMock.mockResolvedValueOnce(redirect(307, 'https://rebind.example.com/'));
    await expect(fetchWithSafeRedirects('https://hooks.example.com/hook')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to a safe public host, keeping method and body for 307/308', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect(308, 'https://next.example.com/v2'))
      .mockResolvedValueOnce(new Response('done', { status: 200 }));
    const res = await fetchWithSafeRedirects('https://hooks.example.com/hook', { method: 'POST', body: '{"a":1}' });
    expect(await res.text()).toBe('done');
    expect(fetchMock.mock.calls[1][0]).toBe('https://next.example.com/v2');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"a":1}', redirect: 'manual' });
  });

  it('turns a POST into a body-less GET after a 302 or 303, like fetch does', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect(303, '/after'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await fetchWithSafeRedirects('https://hooks.example.com/hook', { method: 'POST', body: '{}' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://hooks.example.com/after');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined });
  });

  it('gives up after too many redirects', async () => {
    fetchMock.mockImplementation(async () => redirect(302, 'https://next.example.com/loop'));
    await expect(
      fetchWithSafeRedirects('https://hooks.example.com/hook', {}, { maxRedirects: 3 })
    ).rejects.toThrow(/redirected more than 3 times/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refuses a starting URL whose hostname resolves to a private address', async () => {
    await expect(fetchWithSafeRedirects('https://rebind.example.com/hook')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a non-redirect error response as is', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    const res = await fetchWithSafeRedirects('https://hooks.example.com/hook');
    expect(res.status).toBe(500);
  });
});

describe('unspecified IPv6 address', () => {
  it('is blocked like 0.0.0.0, because connecting to it reaches the local host', () => {
    expect(isBlockedIpAddress('::')).toBe(true);
    expect(() => assertSafeFetchUrl('http://[::]:4000/health')).toThrow(BadRequestException);
  });

  it('does not block public IPv6 addresses', () => {
    expect(isBlockedIpAddress('2606:4700:4700::1111')).toBe(false);
  });
});

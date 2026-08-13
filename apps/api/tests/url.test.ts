import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertSafeFetchUrl } from '../src/common/url';

describe('assertSafeFetchUrl (SSRF protection)', () => {
  it('accepts public https URLs', () => {
    expect(assertSafeFetchUrl('https://example.com/hook')).toBe('https://example.com/hook');
    expect(assertSafeFetchUrl('https://api.example.com:8443/webhook?x=1')).toBe('https://api.example.com:8443/webhook?x=1');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeFetchUrl('ftp://example.com')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('file:///etc/passwd')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('javascript:alert(1)')).toThrow(BadRequestException);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeFetchUrl('not a url')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('')).toThrow(BadRequestException);
  });

  it('blocks loopback hostnames', () => {
    for (const url of [
      'http://localhost:5432/',
      'http://localhost/',
      'https://localhost/',
      'http://127.0.0.1/',
      'http://127.0.0.1:8080/admin',
      'http://[::1]:6379/',
      'http://0.0.0.0/'
    ]) {
      expect(() => assertSafeFetchUrl(url), url).toThrow(BadRequestException);
    }
  });

  it('blocks private and reserved IPv4 ranges', () => {
    for (const url of [
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/'
    ]) {
      expect(() => assertSafeFetchUrl(url), url).toThrow(BadRequestException);
    }
  });

  it('blocks mapped-IPv6 private addresses', () => {
    expect(() => assertSafeFetchUrl('http://[::ffff:127.0.0.1]/')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('http://[::ffff:10.0.0.1]/')).toThrow(BadRequestException);
  });

  it('blocks cloud metadata hostnames and internal TLDs', () => {
    expect(() => assertSafeFetchUrl('http://metadata.google.internal/')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('http://db.internal/')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('http://myhost.lan/')).toThrow(BadRequestException);
    expect(() => assertSafeFetchUrl('http://cache.local/')).toThrow(BadRequestException);
  });

  it('allows public IPv6 addresses', () => {
    expect(assertSafeFetchUrl('http://[2606:4700:4700::1111]/')).toBe('http://[2606:4700:4700::1111]/');
  });
});

import { describe, expect, it } from 'vitest';
import { hostFromLabel, isDarkHex, resolveIcon } from '../src/lib/brand-icons';
import { countryCode } from '../src/lib/country-codes';
import {
  extractIconLinks,
  fetchFollowing,
  findFavicon,
  isBlockedAddress,
  isFetchableUrl,
  letterBadgeSvg,
  normalizeDomain,
  sniffImage,
  type FetchResult,
  type GetFn
} from '../src/lib/favicon';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]);

describe('resolveIcon', () => {
  it('maps browser and OS names as SDKs report them to bundled logos', () => {
    for (const name of ['Chrome', 'Mobile Chrome', 'Safari', 'Mobile Safari', 'Firefox', 'macOS', 'iOS', 'Windows', 'Android', 'Linux', 'Ubuntu', 'Chrome OS']) {
      expect(resolveIcon(name).kind, name).toBe('glyph');
    }
  });

  it('falls back to a favicon for brands simple-icons does not carry', () => {
    expect(resolveIcon('Edge')).toEqual({ kind: 'favicon', domain: 'microsoft.com' });
    expect(resolveIcon('LinkedIn')).toEqual({ kind: 'favicon', domain: 'linkedin.com' });
    expect(resolveIcon('ChatGPT')).toEqual({ kind: 'favicon', domain: 'chatgpt.com' });
  });

  it('recognizes referrer hosts, subdomains and short links', () => {
    expect(resolveIcon('https://www.google.co.uk/search?q=x').kind).toBe('glyph');
    expect(resolveIcon('t.co')).toMatchObject({ kind: 'glyph', glyph: { title: 'X' } });
    expect(resolveIcon('uk.linkedin.com')).toEqual({ kind: 'favicon', domain: 'linkedin.com' });
    expect(resolveIcon('news.ycombinator.com')).toMatchObject({ kind: 'glyph', glyph: { title: 'Y Combinator' } });
    expect(resolveIcon('X (Twitter)', 'x.com')).toMatchObject({ kind: 'glyph', glyph: { title: 'X' } });
  });

  it('uses the favicon of unknown sites and a letter for unknown names', () => {
    expect(resolveIcon('blog.example.org')).toEqual({ kind: 'favicon', domain: 'blog.example.org' });
    expect(resolveIcon('Direct')).toEqual({ kind: 'direct' });
    expect(resolveIcon('Desktop')).toEqual({ kind: 'device', device: 'desktop' });
    const letter = resolveIcon('newsletter');
    expect(letter).toMatchObject({ kind: 'letter', letter: 'N' });
    expect(resolveIcon('newsletter')).toEqual(letter);
  });

  it('parses hosts and spots logos too dark for dark mode', () => {
    expect(hostFromLabel('HTTPS://WWW.Example.com:8080/a')).toBe('example.com');
    expect(hostFromLabel('Direct')).toBeNull();
    expect(isDarkHex('000000')).toBe(true);
    expect(isDarkHex('4285F4')).toBe(false);
  });
});

describe('countryCode', () => {
  it('accepts codes, numeric codes and names', () => {
    expect(countryCode('ng')).toBe('NG');
    expect(countryCode('Nigeria')).toBe('NG');
    expect(countryCode('united kingdom')).toBe('GB');
    expect(countryCode('UK')).toBe('GB');
    expect(countryCode('840')).toBe('US');
    expect(countryCode('ZZ')).toBeNull();
    expect(countryCode('')).toBeNull();
  });
});

describe('favicon endpoint guards', () => {
  it('only accepts public hostnames', () => {
    expect(normalizeDomain('https://Stripe.com/pricing')).toBe('stripe.com');
    expect(normalizeDomain('news.ycombinator.com')).toBe('news.ycombinator.com');
    for (const bad of ['localhost', '127.0.0.1', '10.0.0.1', '[::1]', 'example.com:8080', 'user@example.com', 'printer.local', 'db.internal', 'a', 'foo.123', 'x'.repeat(64) + '.com', '']) {
      expect(normalizeDomain(bad), bad).toBeNull();
    }
  });

  it('blocks private, loopback, link-local and mapped addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:1.1.1.1']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('refuses non-https, odd ports and redirects to internal hosts', async () => {
    expect(isFetchableUrl(new URL('http://example.com/'))).toBe(false);
    expect(isFetchableUrl(new URL('https://example.com:8443/'))).toBe(false);
    expect(isFetchableUrl(new URL('https://127.0.0.1/'))).toBe(false);

    const get: GetFn = async (url) =>
      url.hostname === 'example.com'
        ? response(url, { status: 302, location: 'https://169.254.169.254/latest/meta-data' })
        : response(url, { body: PNG });
    await expect(fetchFollowing(new URL('https://example.com/favicon.ico'), 1000, get)).rejects.toThrow(/Refusing/);
  });

  it('identifies images by their bytes, not the content type', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(ICO)).toBe('image/x-icon');
    expect(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
    expect(sniffImage(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<svg><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><body>not an icon</body></html>'))).toBeNull();
  });

  it('prefers crisp icons from the page markup', () => {
    const html = `<head>
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png" sizes="180x180">
      <link rel="icon" type="image/png" href="/favicon-32.png?v=2&amp;x=1" sizes="32x32">
      <link rel="stylesheet" href="/style.css">
    </head>`;
    const links = extractIconLinks(html, new URL('https://example.com/en/'));
    expect(links.map((url) => url.href)).toEqual([
      'https://example.com/favicon-32.png?v=2&x=1',
      'https://cdn.example.com/touch.png',
      'https://example.com/favicon-16.png',
      'https://example.com/mask.svg'
    ]);
  });

  it('finds the icon a page links to, then falls back to /favicon.ico', async () => {
    const requested: string[] = [];
    const site: Record<string, Partial<FetchResult>> = {
      'https://example.com/': { status: 301, location: 'https://www.example.com/' },
      'https://www.example.com/': { contentType: 'text/html', body: Buffer.from('<link rel="icon" href="/brand.png">') },
      'https://www.example.com/brand.png': { contentType: 'text/html', body: Buffer.from('<html>soft 404</html>') },
      'https://www.example.com/favicon.ico': { contentType: 'image/x-icon', body: ICO }
    };
    const get: GetFn = async (url) => {
      requested.push(url.href);
      return response(url, site[url.href] ?? { status: 404 });
    };
    const icon = await findFavicon('example.com', get);
    expect(icon?.type).toBe('image/x-icon');
    expect(requested).toEqual([
      'https://example.com/',
      'https://www.example.com/',
      'https://www.example.com/brand.png',
      'https://www.example.com/favicon.ico'
    ]);
  });

  it('returns null when nothing usable exists, and the badge escapes nothing unsafe', async () => {
    const get: GetFn = async (url) => response(url, { status: 404, body: Buffer.from('nope') });
    expect(await findFavicon('example.com', get)).toBeNull();
    expect(letterBadgeSvg('stripe.com')).toMatch(/^<svg[^>]*>.*>S<\/text><\/svg>$/);
  });
});

function response(url: URL, partial: Partial<FetchResult>): FetchResult {
  return { status: 200, url: url.href, contentType: '', location: null, body: Buffer.alloc(0), ...partial };
}

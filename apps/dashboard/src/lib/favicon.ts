// Server-side favicon lookup behind /api/favicon. Referrer icons are fetched by
// our own server instead of a third-party service (Google's s2, DuckDuckGo), so
// a customer's referrer list never leaves their TraceIQ install.
//
// The endpoint fetches URLs derived from user input, so it is written as an
// SSRF boundary: https only, default port only, public hostnames only, and every
// address DNS returns is checked at connect time (not before), so a rebinding
// answer can't point a request at an internal service. Bodies are size-capped and
// must sniff as an image.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { letterIcon } from './brand-icons';

const MAX_HTML_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 4;
const USER_AGENT = 'Mozilla/5.0 (compatible; TraceIQ-Favicon/1.0; +https://traceiq.run)';

// ── Input validation ──

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa', '.onion', '.test', '.invalid', '.example'];

/** A public hostname from user input, or null. IP literals are never accepted. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0];
  if (host.includes('@') || host.includes(':')) return null;
  host = host.replace(/\.$/, '');
  if (host.length === 0 || host.length > 253 || isIP(host)) return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  // Real TLDs are letters (or punycode); this also rejects numeric hosts like 10.0.0.1.x
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1])) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => `.${host}`.endsWith(suffix))) return null;
  return host;
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8]
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** True for loopback, private, link-local, CGNAT, documentation and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms: judge the embedded IPv4.
    const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    if (/^::ffff:/.test(lower)) return true;
    return blocked.check(lower, 'ipv6');
  }
  return true;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand a blocked address to the socket. */
function safeLookup(hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) {
  const wantAll = typeof options === 'object' && options !== null && options.all === true;
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, wantAll ? [] : '', 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isBlockedAddress(entry.address))) {
      const refused = Object.assign(new Error(`Refusing to connect to ${hostname}: non-public address`), { code: 'EBLOCKED' });
      return callback(refused, wantAll ? [] : '', 0);
    }
    if (wantAll) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

// ── HTTP ──

export interface FetchResult {
  status: number;
  url: string;
  contentType: string;
  location: string | null;
  body: Buffer;
}

export type GetFn = (url: URL, maxBytes: number) => Promise<FetchResult>;

/** One https GET, no redirects, body capped at maxBytes (larger bodies reject). */
export const httpsGet: GetFn = (url, maxBytes) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: safeLookup as never,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' }
      },
      (response) => {
        const declared = Number(response.headers['content-length'] ?? 0);
        if (declared > maxBytes) {
          response.destroy();
          reject(new Error('Response too large'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy();
            reject(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            url: url.toString(),
            contentType: String(response.headers['content-type'] ?? '').toLowerCase(),
            location: typeof response.headers.location === 'string' ? response.headers.location : null,
            body: Buffer.concat(chunks)
          })
        );
        response.on('error', reject);
      }
    );
    request.on('timeout', () => request.destroy(new Error('Timed out')));
    request.on('error', reject);
    request.end();
  });

/** True when a URL is one the endpoint may request. */
export function isFetchableUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.port === '' || url.port === '443') && !url.username && !url.password && normalizeDomain(url.hostname) === url.hostname;
}

/** GET with redirects, re-validating every hop. */
export async function fetchFollowing(start: URL, maxBytes: number, get: GetFn = httpsGet): Promise<FetchResult> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isFetchableUrl(url)) throw new Error(`Refusing to fetch ${url.toString()}`);
    const result = await get(url, maxBytes);
    if (result.status >= 300 && result.status < 400 && result.location) {
      url = new URL(result.location, url);
      continue;
    }
    return result;
  }
  throw new Error('Too many redirects');
}

// ── Icon discovery ──

export type IconType = 'image/png' | 'image/x-icon' | 'image/gif' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';

/** The image type from the bytes themselves; the server's content-type is not trusted. */
export function sniffImage(body: Buffer): IconType | null {
  if (body.length < 4) return null;
  if (body[0] === 0x89 && body.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (body[0] === 0 && body[1] === 0 && (body[2] === 1 || body[2] === 2) && body[3] === 0) return 'image/x-icon';
  if (body.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body.subarray(0, 4).toString('latin1') === 'RIFF' && body.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const head = body.subarray(0, 2048).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head) && !/<script|\son\w+\s*=/i.test(body.toString('utf8'))) {
    return 'image/svg+xml';
  }
  return null;
}

/** Icon links in a page's markup, best candidates first. */
export function extractIconLinks(html: string, base: URL): URL[] {
  const head = html.slice(0, MAX_HTML_BYTES);
  const found: Array<{ url: URL; score: number }> = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, 'rel')?.toLowerCase() ?? '';
    const href = attribute(tag, 'href');
    if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)(\s|$)/.test(rel)) continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'data:') continue;
    const sizes = attribute(tag, 'sizes') ?? '';
    const size = Number(sizes.match(/(\d+)x\d+/i)?.[1] ?? 0);
    const type = attribute(tag, 'type') ?? '';
    // Prefer SVG, then 32–96px icons. Touch icons are big and often padded on a
    // colored tile, and mask icons are single-color, so those rank lower.
    let score = rel.includes('mask-icon') ? -50 : 0;
    if (type.includes('svg') || url.pathname.endsWith('.svg')) score += 40;
    if (size >= 32 && size <= 96) score += 30 + size / 10;
    else if (size > 96) score += 20;
    else if (size > 0) score += 5;
    if (rel.includes('apple-touch-icon')) score -= 5;
    found.push({ url, score });
  }
  return found.sort((a, b) => b.score - a.score).map((entry) => entry.url);
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#x2f;/gi, '/').replace(/&#47;/g, '/');
}

function decodeDataUrl(url: URL): Buffer | null {
  const match = url.href.match(/^data:([^,]*?)(;base64)?,(.*)$/s);
  if (!match) return null;
  try {
    const body = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    return body.length <= MAX_ICON_BYTES ? body : null;
  } catch {
    return null;
  }
}

export interface IconResult {
  body: Buffer;
  type: IconType;
}

/** Finds a site's icon: the page's <link rel=icon> tags first, then /favicon.ico. */
export async function findFavicon(domain: string, get: GetFn = httpsGet): Promise<IconResult | null> {
  const candidates: URL[] = [];
  for (const host of domain.startsWith('www.') ? [domain] : [domain, `www.${domain}`]) {
    try {
      const page = await fetchFollowing(new URL(`https://${host}/`), MAX_HTML_BYTES, get);
      if (page.status < 400 && (page.contentType.includes('html') || page.contentType === '')) {
        candidates.push(...extractIconLinks(page.body.toString('utf8'), new URL(page.url)));
      }
      candidates.push(new URL('/favicon.ico', page.url));
      break;
    } catch {
      // Unreachable or refused: try the www host, then the bare /favicon.ico.
    }
  }
  if (candidates.length === 0) candidates.push(new URL(`https://${domain}/favicon.ico`));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.href) || seen.size >= 5) continue;
    seen.add(candidate.href);
    try {
      const body = candidate.protocol === 'data:' ? decodeDataUrl(candidate) : (await fetchFollowing(candidate, MAX_ICON_BYTES, get)).body;
      const type = body ? sniffImage(body) : null;
      if (body && type) return { body, type };
    } catch {
      // Next candidate.
    }
  }
  return null;
}

// ── Fallback badge ──

/** Initial-letter SVG for sites without a usable icon; matches the client-side badge. */
export function letterBadgeSvg(domain: string): string {
  const { letter, hue } = letterIcon(domain);
  const safe = letter.replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="hsl(${hue} 55% 45%)"/><text x="16" y="21.5" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="18" font-weight="600" text-anchor="middle" fill="#fff">${safe}</text></svg>`;
}

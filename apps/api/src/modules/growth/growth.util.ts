import { createHash } from 'node:crypto';

/** Hosts whose referrals are the site itself, not traffic sources. */
const OWN_HOSTS = new Set(['traceiq.run', 'www.traceiq.run', 'localhost', '127.0.0.1']);

/** Routes that are the product, not the public site; their page loads are never counted. */
const PRIVATE_PREFIXES = ['/dashboard', '/admin', '/auth', '/api', '/invite', '/share', '/onboarding'];

const BOT_PATTERN =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|axios|node-fetch|go-http|java\/|phantom|puppeteer|playwright|selenium/i;

export interface PageviewInput {
  path?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
}

export interface Pageview {
  path: string;
  referrerHost: string | null;
  utmSource: string | null;
}

/** Validates and trims a beacon body; null means "don't count this one". */
export function parsePageview(body: PageviewInput | undefined): Pageview | null {
  if (!body || typeof body.path !== 'string') return null;
  let path = body.path.trim().split(/[?#]/)[0] ?? '';
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 300) return null;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;

  return {
    path,
    referrerHost: referrerHost(body.referrer),
    utmSource: typeof body.utmSource === 'string' ? cleanLabel(body.utmSource) : null
  };
}

export function referrerHost(referrer: unknown): string | null {
  if (typeof referrer !== 'string' || !referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || OWN_HOSTS.has(host) || OWN_HOSTS.has(`www.${host}`)) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export function deviceFromUserAgent(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** The per-day visitor ID: unique within a UTC day, unlinkable once that day's salt is gone. */
export function visitorHash(salt: string, ip: string, userAgent: string): string {
  return createHash('sha256').update(`${salt}\n${ip}\n${userAgent}`).digest('hex').slice(0, 32);
}

export function utcDay(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Every UTC day from `days - 1` days ago through today, oldest first. */
export function dayRange(days: number, now = new Date()): string[] {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - i);
    result.push(utcDay(date));
  }
  return result;
}

function cleanLabel(value: string): string | null {
  const label = value.trim().toLowerCase().replace(/[^a-z0-9._ -]/g, '').slice(0, 60);
  return label || null;
}

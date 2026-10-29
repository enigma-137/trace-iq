import { randomInt } from 'node:crypto';

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const GENERATED_SLUG_LENGTH = 7;

// Paths a person might expect to mean something else on the short-link domain.
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'demo', 'docs', 'help', 'links',
  'login', 'logout', 'new', 'pricing', 'settings', 'signup', 'status', 'support', 'traceiq'
]);

export const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type UtmField = (typeof UTM_FIELDS)[number];
export type UtmValues = Partial<Record<UtmField, string | null>>;

export function generateSlug(): string {
  let slug = '';
  for (let i = 0; i < GENERATED_SLUG_LENGTH; i++) slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return slug;
}

/** Returns a normalized slug or an error message. */
export function normalizeSlug(raw: string): { slug: string } | { error: string } {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    return { error: 'Slug must be 3-64 characters: lowercase letters, numbers, dashes or underscores, starting with a letter or number.' };
  }
  if (RESERVED_SLUGS.has(slug)) return { error: `"${slug}" is reserved. Pick another slug.` };
  return { slug };
}

/**
 * Accepts only absolute http(s) URLs with a host, and refuses destinations on the
 * short-link host itself so a link can't redirect to another short link in a loop.
 */
export function validateDestination(raw: string, shortLinkBaseUrl: string): { url: string } | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: 'Destination must be a full URL, like https://example.com/pricing.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Destination must start with http:// or https://.' };
  }
  if (!parsed.hostname) return { error: 'Destination must include a host.' };
  if (parsed.username || parsed.password) return { error: 'Destination must not contain a username or password.' };
  const shortHost = safeHost(shortLinkBaseUrl);
  if (shortHost && parsed.host === shortHost && parsed.pathname.startsWith('/l/')) {
    return { error: 'Destination cannot be another short link.' };
  }
  if (parsed.toString().length > 2048) return { error: 'Destination must be 2048 characters or fewer.' };
  return { url: parsed.toString() };
}

/** Adds the link's UTM tags to the destination, keeping any the URL already sets. */
export function withUtm(destination: string, utm: UtmValues): string {
  const url = new URL(destination);
  for (const field of UTM_FIELDS) {
    const value = utm[field];
    if (value && !url.searchParams.has(field)) url.searchParams.set(field, value);
  }
  return url.toString();
}

export function cleanUtm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

// Link-preview fetchers and crawlers; their requests redirect normally but aren't counted.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python-requests|headless|lighthouse|monitor/i;

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

/** Coarse device info in the same shape SDK events use (`browser`, `os`, `deviceType`). */
export function parseUserAgent(userAgent: string | undefined): { browser?: string; os?: string; deviceType?: string } {
  if (!userAgent) return {};
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : undefined;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : undefined;
  const deviceType = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'mobile' : 'desktop';
  return { ...(browser && { browser }), ...(os && { os }), deviceType };
}

/** The referring site's host, or undefined for direct visits and unparseable values. */
export function referrerHost(referrer: string | undefined): string | undefined {
  return referrer ? safeHost(referrer) : undefined;
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
}

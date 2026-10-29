import { NextResponse, type NextRequest } from 'next/server';
import { findFavicon, letterBadgeSvg, normalizeDomain, type IconResult } from '@/lib/favicon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/favicon?domain=example.com → the site's icon, or a letter badge when
// it has none. Public (the live demo uses it) and cached hard, in memory and in
// browsers, so each domain is fetched at most about once a day per server.

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
// Lookups that miss the cache, per client per minute.
const LOOKUPS_PER_MINUTE = 60;

interface CacheEntry {
  icon: IconResult | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<IconResult | null>>();
const lookupsByClient = new Map<string, { count: number; windowStart: number }>();

function remember(domain: string, icon: IconResult | null) {
  cache.delete(domain);
  cache.set(domain, { icon, expires: Date.now() + (icon ? FOUND_TTL_MS : MISSING_TTL_MS) });
  // Maps keep insertion order, so the first key is the least recently stored.
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

function allowLookup(client: string): boolean {
  const now = Date.now();
  const entry = lookupsByClient.get(client);
  if (!entry || now - entry.windowStart > 60_000) {
    if (lookupsByClient.size > 10_000) lookupsByClient.clear();
    lookupsByClient.set(client, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= LOOKUPS_PER_MINUTE;
}

function lookup(domain: string): Promise<IconResult | null> {
  const pending = inflight.get(domain);
  if (pending) return pending;
  const promise = findFavicon(domain)
    .catch(() => null)
    .then((icon) => {
      remember(domain, icon);
      return icon;
    })
    .finally(() => inflight.delete(domain));
  inflight.set(domain, promise);
  return promise;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // An SVG opened directly must not run anything or load anything.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin'
};

function iconResponse(icon: IconResult) {
  return new NextResponse(new Uint8Array(icon.body), {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': icon.type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    }
  });
}

function badgeResponse(domain: string, maxAge: number) {
  return new NextResponse(letterBadgeSvg(domain), {
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'image/svg+xml', 'Cache-Control': `public, max-age=${maxAge}` }
  });
}

export async function GET(request: NextRequest) {
  const domain = normalizeDomain(request.nextUrl.searchParams.get('domain'));
  if (!domain) {
    return new NextResponse('Invalid domain', { status: 400, headers: SECURITY_HEADERS });
  }

  const cached = cache.get(domain);
  if (cached && cached.expires > Date.now()) {
    return cached.icon ? iconResponse(cached.icon) : badgeResponse(domain, 3600);
  }

  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.ip || 'unknown';
  if (!inflight.has(domain) && !allowLookup(client)) {
    // Not cached for long, so the real icon shows once the client slows down.
    return badgeResponse(domain, 60);
  }

  const icon = await lookup(domain);
  return icon ? iconResponse(icon) : badgeResponse(domain, 3600);
}

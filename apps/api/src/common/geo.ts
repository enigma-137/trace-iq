export interface ResolvedGeo {
  ipAddress?: string;
  country?: string;
  region?: string;
  city?: string;
}

interface GeoLookupRecord {
  country?: string;
  region?: string | string[];
  city?: string;
}

/**
 * Pick the client IP from the request: the first hop of X-Forwarded-For (added by
 * proxies/CDNs) if present, otherwise the socket remote address.
 */
export function extractClientIp(forwardedFor?: string, remoteIp?: string): string | undefined {
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return normalizeIp(first);
    }
  }
  return remoteIp ? normalizeIp(remoteIp) : undefined;
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '0.0.0.0') {
    return false;
  }
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) {
    return false;
  }
  const privateBlock = ip.match(/^172\.(\d+)\./);
  if (privateBlock && Number(privateBlock[1]) >= 16 && Number(privateBlock[1]) <= 31) {
    return false;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return false;
  }
  return true;
}

let geoipTried = false;
let geoip: { lookup(ip: string): GeoLookupRecord | null } | null = null;

function getGeoip(): { lookup(ip: string): GeoLookupRecord | null } | null {
  if (!geoipTried) {
    geoipTried = true;
    try {
      // Optional dependency — bundled offline GeoLite2 DB. Skipped if not installed.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      geoip = require('geoip-lite');
    } catch {
      geoip = null;
    }
  }
  return geoip;
}

/**
 * Resolve approximate location for an event. Prefers CDN/edge geo headers
 * (Cloudflare / Vercel) when present, then falls back to an offline GeoIP lookup.
 */
export function resolveGeo(ip: string | undefined, headers: Record<string, string | undefined> = {}): ResolvedGeo {
  const geo: ResolvedGeo = {};
  if (ip) {
    geo.ipAddress = ip;
  }

  const headerCountry = headers['cf-ipcountry'] ?? headers['x-vercel-ip-country'];
  const headerRegion = headers['x-vercel-ip-country-region'];
  const headerCity = headers['x-vercel-ip-city'];
  if (headerCountry && headerCountry !== 'XX') {
    geo.country = headerCountry;
  }
  if (headerRegion) {
    geo.region = safeDecode(headerRegion);
  }
  if (headerCity) {
    geo.city = safeDecode(headerCity);
  }

  if ((!geo.country || !geo.city) && ip && isPublicIp(ip)) {
    const record = getGeoip()?.lookup(ip);
    if (record) {
      geo.country = geo.country ?? record.country;
      geo.region = geo.region ?? (Array.isArray(record.region) ? record.region[0] : record.region);
      geo.city = geo.city ?? record.city;
    }
  }

  return geo;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

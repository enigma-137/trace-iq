import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type TrackedRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * Rate limits per client instead of per proxy.
 *
 * In production the API sits behind Caddy, so `req.ip` is the proxy's address for every
 * request and each route's limit would be one bucket shared by all users. When
 * TRUST_PROXY_HEADERS=true the client comes from the proxy headers instead. The last
 * X-Forwarded-For entry is used because it is the one the nearest proxy added; earlier
 * entries are client-supplied and could be rotated to dodge limits. Without the env var,
 * headers are ignored so they can't be spoofed on a directly exposed API.
 */
export function throttleTracker(req: TrackedRequest): string {
  const remote = normalize(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return remote;

  const forwarded = header(req, 'x-forwarded-for')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const nearest = forwarded?.[forwarded.length - 1];
  if (nearest) return normalize(nearest);

  const realIp = header(req, 'x-real-ip')?.trim();
  return realIp ? normalize(realIp) : remote;
}

@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return throttleTracker(req as TrackedRequest);
  }
}

function header(req: TrackedRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function normalize(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

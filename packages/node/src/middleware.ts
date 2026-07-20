import type { CaptureParams } from './client';

// Minimal structural types so we don't depend on express (works with express,
// connect, and anything that follows the (req, res, next) contract).
export interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  baseUrl?: string;
  path?: string;
  route?: { path?: unknown };
}

export interface ResponseLike {
  statusCode?: number;
  on(event: 'finish', listener: () => void): void;
}

export type NextLike = (error?: unknown) => void;

export interface MiddlewareOptions {
  /** Pull the identified user id off the request (e.g. (req) => req.user?.id). */
  resolveUserId?: (req: RequestLike) => string | undefined;
  /** Override how the route/path is derived. Defaults to the Express route template. */
  path?: (req: RequestLike) => string;
  /** Return true to skip a request (health checks, static assets, …). */
  ignore?: (req: RequestLike) => boolean;
}

interface Capturer {
  capture(params: CaptureParams): void;
}

/**
 * Express/connect-style middleware that times each request and emits a
 * `$api_request` event (method, path, status, durationMs) when the response
 * finishes. Timing and capture never throw into the request lifecycle.
 */
export function createRequestMiddleware(client: Capturer, options: MiddlewareOptions = {}) {
  return function traceiqRequestMiddleware(req: RequestLike, res: ResponseLike, next: NextLike): void {
    if (options.ignore?.(req)) {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const status = res.statusCode ?? 0;
        client.capture({
          event: '$api_request',
          userId: options.resolveUserId?.(req),
          properties: {
            method: (req.method ?? 'GET').toUpperCase(),
            path: options.path ? options.path(req) : derivePath(req),
            status,
            durationMs: Math.round(durationMs),
            ok: status >= 200 && status < 400
          }
        });
      } catch {
        // Never let instrumentation break the request.
      }
    });

    next();
  };
}

function derivePath(req: RequestLike): string {
  // Prefer the matched route template (/users/:id) so requests group cleanly.
  const routePath = req.route?.path;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return normalizeApiPath(`${req.baseUrl ?? ''}${routePath}`);
  }
  return normalizeApiPath(req.originalUrl ?? req.url ?? req.path ?? '/');
}

// Strips query + collapses id-like segments so /users/123 -> /users/:id.
export function normalizeApiPath(rawUrl: string): string {
  const pathname = rawUrl.split('?')[0].split('#')[0];
  const collapsed = pathname
    .split('/')
    .map((segment) => (isIdSegment(segment) ? ':id' : segment))
    .join('/');
  return collapsed || '/';
}

function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true;
  if (/^\d/.test(segment) && /[a-z]/i.test(segment) && segment.length >= 12) return true;
  return false;
}

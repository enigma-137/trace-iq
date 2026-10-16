import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { ObservabilityService } from '../../modules/observability/observability.service';

// A project's Logs belong to the connected app, not to TraceIQ's own traffic. The
// only TraceIQ-side requests worth surfacing there are SDK deliveries that failed
// (rejected write key, rate limit, bad payload): the app's developers need to know
// their data isn't arriving. Successful ingestion and all dashboard/setup/admin
// traffic are never recorded.
const SDK_PATH_PREFIXES = ['/v1/events', '/v1/flags', '/v1/experiments', '/v1/surveys', '/v1/replays'];

export function shouldRecordRequest(path: string, statusCode: number): boolean {
  if (statusCode < 400) return false;
  return SDK_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observabilityService: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      return next.handle();
    }

    const path = req.path || req.url || '';
    // Skip health checks, metrics, favicon, log queries, and direct log ingestion to prevent feedback loops
    if (
      path === '/health' ||
      path === '/metrics' ||
      path === '/favicon.ico' ||
      path.startsWith('/v1/dashboard/logs') ||
      path === '/v1/logs' ||
      path.startsWith('/v1/logs/')
    ) {
      return next.handle();
    }

    const startMs = Date.now();
    const traceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      `trc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // Set trace and request id headers on response
    if (res.setHeader) {
      res.setHeader('x-trace-id', traceId);
      res.setHeader('x-request-id', requestId);
    }

    const clientIp =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    const userAgent = (req.headers['user-agent'] as string) || undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startMs;
          const statusCode = res.statusCode || 200;
          this.logRequest({
            req,
            statusCode,
            durationMs,
            method,
            path,
            clientIp,
            userAgent,
            traceId,
            requestId
          });
        },
        error: (err) => {
          const durationMs = Date.now() - startMs;
          const statusCode = err?.status || err?.statusCode || 500;
          this.logRequest({
            req,
            statusCode,
            durationMs,
            method,
            path,
            clientIp,
            userAgent,
            traceId,
            requestId,
            error: err
          });
        }
      })
    );
  }

  private logRequest(params: {
    req: any;
    statusCode: number;
    durationMs: number;
    method: string;
    path: string;
    clientIp?: string;
    userAgent?: string;
    traceId: string;
    requestId: string;
    error?: any;
  }) {
    if (!shouldRecordRequest(params.path, params.statusCode)) return;

    // Fire and forget, don't let log recording ever break request flow
    Promise.resolve().then(async () => {
      try {
        const projectId =
          params.req.query?.projectId ||
          params.req.body?.projectId ||
          params.req.headers?.['x-project-id'] ||
          params.req.project?.id ||
          params.req.user?.projectId;

        // If no explicit project ID found on the request, we skip or use default if available
        if (!projectId) {
          return;
        }

        const serverFault = params.statusCode >= 500;
        const reason = typeof params.error?.message === 'string' ? `: ${params.error.message.slice(0, 200)}` : '';

        await this.observabilityService.recordLog({
          projectId,
          level: serverFault ? 'error' : 'warn',
          source: 'sdk',
          service: 'traceiq-ingest',
          message: `SDK delivery failed — ${params.method} ${params.path} -> ${params.statusCode}${reason}`,
          status: serverFault ? 'error' : 'warning',
          statusCode: params.statusCode,
          durationMs: params.durationMs,
          method: params.method,
          route: params.path,
          clientIp: params.clientIp,
          userAgent: params.userAgent,
          traceId: params.traceId,
          requestId: params.requestId,
          sessionId: params.req.body?.sessionId || params.req.query?.sessionId,
          distinctId: params.req.body?.userId || params.req.body?.anonymousId,
          actorUserId: params.req.user?.id,
          metadata: {
            query: params.req.query,
            routeParams: params.req.params
          },
          errorDetails: params.error
            ? {
                message: params.error.message,
                stack: params.error.stack,
                name: params.error.name
              }
            : null
        });
      } catch {
        // Silently swallow logger recording issues
      }
    });
  }
}

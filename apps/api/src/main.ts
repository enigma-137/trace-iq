import './config/env';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { json } from 'express';
import { AppModule } from './app.module';

// Cap request bodies. Ingestion batches of 500 events are the largest legitimate
// payloads; 1MB is generous for them and still bounds memory/disk abuse.
const MAX_BODY_BYTES = 1_048_576;

// Paths the browser SDKs call directly with the project write key. These must
// accept requests from any customer origin, so CORS stays open for them.
const PUBLIC_INGEST_PATHS = ['/v1/events', '/v1/events/batch', '/v1/flags/evaluate'];

function setSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function parseOrigins(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : fallback;
}

function isIngestPath(pathname: string): boolean {
  return PUBLIC_INGEST_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

async function bootstrap() {
  const authMode = (process.env.AUTH_MODE ?? 'supabase').trim().toLowerCase();
  const host = process.env.API_HOST ?? (authMode === 'local' ? '127.0.0.1' : '0.0.0.0');
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

  if (authMode === 'local' && !loopbackHosts.has(host) && process.env.LOCAL_AUTH_ALLOW_NETWORK !== 'true') {
    throw new Error(
      'AUTH_MODE=local may only bind to loopback by default. Set LOCAL_AUTH_ALLOW_NETWORK=true only behind a trusted private network or loopback-only port mapping.'
    );
  }

  const app = await NestFactory.create(AppModule);

  app.use(json({
    limit: MAX_BODY_BYTES,
    verify: (request, _response, buffer) => {
      // Bachs signs the exact request bytes. Preserve them before Express parses
      // JSON; re-serializing the object would invalidate the signature.
      (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    }
  }));

  // CORS is path-aware: ingestion endpoints stay open for browser SDKs running
  // on any customer site, while dashboard/setup APIs are restricted to the
  // configured dashboard origins. Requests without an Origin header (server
  // SDKs, curl) are never blocked by CORS.
  const corsOrigins = parseOrigins(process.env.CORS_ORIGINS, [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ]);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const corsMiddleware = isIngestPath(req.path)
      ? cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-traceiq-write-key'], maxAge: 86400 })
      : cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-traceiq-write-key'], maxAge: 86400 });
    corsMiddleware(req, res, next);
  });

  app.use(setSecurityHeaders);

  await app.listen(process.env.API_PORT ? Number(process.env.API_PORT) : 4000, host);
}

void bootstrap();

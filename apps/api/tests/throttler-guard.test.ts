import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProxyAwareThrottlerGuard, throttleTracker } from '../src/common/throttler.guard';

const originalTrust = process.env.TRUST_PROXY_HEADERS;

afterEach(() => {
  if (originalTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
  else process.env.TRUST_PROXY_HEADERS = originalTrust;
});

describe('throttleTracker', () => {
  it('ignores proxy headers unless TRUST_PROXY_HEADERS=true', () => {
    delete process.env.TRUST_PROXY_HEADERS;
    expect(throttleTracker({ ip: '::ffff:172.18.0.5', headers: { 'x-forwarded-for': '203.0.113.7' } })).toBe('172.18.0.5');
  });

  it('uses the entry the nearest proxy added when proxy headers are trusted', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(throttleTracker({ ip: '172.18.0.5', headers: { 'x-forwarded-for': '203.0.113.7' } })).toBe('203.0.113.7');
    // A client-supplied first entry can't pick its own bucket.
    expect(throttleTracker({ ip: '172.18.0.5', headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' } })).toBe('203.0.113.7');
    expect(throttleTracker({ ip: '172.18.0.5', headers: { 'x-real-ip': '198.51.100.2' } })).toBe('198.51.100.2');
    expect(throttleTracker({ ip: '172.18.0.5', headers: {} })).toBe('172.18.0.5');
  });
});

@Controller('limited')
class LimitedController {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 2 }])],
  controllers: [LimitedController],
  providers: [{ provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard }]
})
class LimitedModule {}

describe('ProxyAwareThrottlerGuard behind a proxy', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(LimitedModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  // Every request reaches the app from 127.0.0.1, like traffic arriving through Caddy.
  const hit = (forwardedFor: string) =>
    fetch(`${baseUrl}/limited`, { headers: { 'x-forwarded-for': forwardedFor } }).then((response) => response.status);

  it('gives each client its own bucket instead of sharing the proxy address', async () => {
    process.env.TRUST_PROXY_HEADERS = 'true';

    expect(await hit('203.0.113.1')).toBe(200);
    expect(await hit('203.0.113.1')).toBe(200);
    expect(await hit('203.0.113.1')).toBe(429);
    // A different visitor through the same proxy is unaffected.
    expect(await hit('203.0.113.2')).toBe(200);
  });
});

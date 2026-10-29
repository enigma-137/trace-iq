import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LINK_CLICK_EVENT, LinksService } from '../src/modules/links/links.service';
import { isBot, normalizeSlug, parseUserAgent, validateDestination, withUtm } from '../src/modules/links/links.util';
import { empty, mockDatabase, rows } from './helpers/mock-db';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const project = { id: 'proj_1', name: 'Shop', slug: 'shop', organizationId: 'org_1', organizationName: 'Org', role: 'owner' };
const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'session' };

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lnk_1',
    organization_id: 'org_1',
    project_id: 'proj_1',
    slug: 'launch',
    destination_url: 'https://shop.example/pricing',
    title: 'Launch post',
    utm_source: 'twitter',
    utm_medium: null,
    utm_campaign: 'launch',
    utm_term: null,
    utm_content: null,
    expires_at: null,
    archived_at: null,
    click_count: 3,
    last_clicked_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides
  };
}

function makeService(onQuery: Parameters<typeof mockDatabase>[0]) {
  const db = mockDatabase(onQuery);
  const projects = {
    resolveActiveProject: vi.fn().mockResolvedValue(project),
    requireActiveProject: vi.fn().mockResolvedValue(project),
    requireWritableProject: vi.fn().mockResolvedValue(project)
  };
  const usage = { consumeProjectEvents: vi.fn().mockResolvedValue({ warningThreshold: null }) };
  const service = new LinksService(db as never, projects as never, usage as never);
  return { db, usage, service };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('links util', () => {
  it('normalizes slugs and rejects bad or reserved ones', () => {
    expect(normalizeSlug('  Launch-2026 ')).toEqual({ slug: 'launch-2026' });
    expect(normalizeSlug('ab')).toHaveProperty('error');
    expect(normalizeSlug('has space')).toHaveProperty('error');
    expect(normalizeSlug('dashboard')).toHaveProperty('error');
  });

  it('accepts only http(s) destinations that are not other short links', () => {
    expect(validateDestination('https://shop.example/a?b=1', 'https://traceiq.run')).toEqual({ url: 'https://shop.example/a?b=1' });
    expect(validateDestination('javascript:alert(1)', 'https://traceiq.run')).toHaveProperty('error');
    expect(validateDestination('ftp://shop.example', 'https://traceiq.run')).toHaveProperty('error');
    expect(validateDestination('https://user:pw@shop.example', 'https://traceiq.run')).toHaveProperty('error');
    expect(validateDestination('https://traceiq.run/l/other', 'https://traceiq.run')).toHaveProperty('error');
    expect(validateDestination('not a url', 'https://traceiq.run')).toHaveProperty('error');
  });

  it('adds UTM tags without overriding ones already on the URL', () => {
    const url = new URL(withUtm('https://shop.example/?utm_source=newsletter', { utm_source: 'twitter', utm_campaign: 'launch' }));
    expect(url.searchParams.get('utm_source')).toBe('newsletter');
    expect(url.searchParams.get('utm_campaign')).toBe('launch');
  });

  it('spots crawlers and parses common browsers', () => {
    expect(isBot('Twitterbot/1.0')).toBe(true);
    expect(isBot('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot(CHROME_MAC)).toBe(false);
    expect(parseUserAgent(CHROME_MAC)).toEqual({ browser: 'Chrome', os: 'macOS', deviceType: 'desktop' });
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: 'Safari', os: 'iOS', deviceType: 'mobile' });
  });
});

describe('LinksService.resolve', () => {
  it('redirects with UTM tags and records one $link_click event', async () => {
    const { db, usage, service } = makeService((text) => (text.includes('FROM short_links WHERE slug') ? rows([linkRow()]) : empty()));

    const result = await service.resolve('Launch', {
      userAgent: CHROME_MAC,
      referrer: 'https://news.ycombinator.com/item?id=1',
      ip: '203.0.113.9'
    });
    await flush();

    const destination = new URL(result.destination);
    expect(destination.searchParams.get('utm_source')).toBe('twitter');
    expect(destination.searchParams.get('utm_campaign')).toBe('launch');
    expect(usage.consumeProjectEvents).toHaveBeenCalledWith(expect.anything(), 'org_1', 'proj_1', 1);

    const insert = db.queryCalls('INSERT INTO events')[0];
    expect(insert.values).toContain(LINK_CLICK_EVENT);
    const properties = JSON.parse(insert.values[5] as string);
    expect(properties).toMatchObject({ linkId: 'lnk_1', slug: 'launch', referrerHost: 'news.ycombinator.com', utm_source: 'twitter' });
    expect(JSON.parse(insert.values[6] as string)).toMatchObject({ browser: 'Chrome' });
    expect(JSON.stringify(insert.values)).not.toContain('203.0.113.9');
    expect(db.queryCalls('click_count = click_count + 1')).toHaveLength(1);
  });

  it('redirects bots without counting them, and counts a quick repeat click once', async () => {
    const { db, service } = makeService((text) => (text.includes('FROM short_links WHERE slug') ? rows([linkRow()]) : empty()));

    await service.resolve('launch', { userAgent: 'facebookexternalhit/1.1', ip: '1.1.1.1' });
    await service.resolve('launch', { userAgent: CHROME_MAC, ip: '1.1.1.1' });
    await service.resolve('launch', { userAgent: CHROME_MAC, ip: '1.1.1.1' });
    await flush();

    expect(db.queryCalls('INSERT INTO events')).toHaveLength(1);
    // The second and third lookups were served from cache.
    expect(db.queryCalls('FROM short_links WHERE slug')).toHaveLength(1);
  });

  it('still redirects when the click cannot be recorded', async () => {
    const { usage, service } = makeService((text) => (text.includes('FROM short_links WHERE slug') ? rows([linkRow()]) : empty()));
    usage.consumeProjectEvents.mockRejectedValueOnce(new Error('Monthly event limit reached'));

    await expect(service.resolve('launch', { userAgent: CHROME_MAC, ip: '2.2.2.2' })).resolves.toHaveProperty('destination');
    await flush();
  });

  it('refuses missing, archived and expired links', async () => {
    const missing = makeService(() => empty()).service;
    await expect(missing.resolve('nope', { userAgent: CHROME_MAC })).rejects.toBeInstanceOf(NotFoundException);

    const archived = makeService(() => rows([linkRow({ archived_at: '2026-10-02T00:00:00Z' })])).service;
    await expect(archived.resolve('launch', { userAgent: CHROME_MAC })).rejects.toBeInstanceOf(NotFoundException);

    const expired = makeService(() => rows([linkRow({ expires_at: '2020-01-01T00:00:00Z' })])).service;
    await expect(expired.resolve('launch', { userAgent: CHROME_MAC })).rejects.toBeInstanceOf(GoneException);
  });
});

describe('LinksService.create', () => {
  it('creates a link with a chosen slug in the writable project', async () => {
    const { db, service } = makeService((text) => (text.includes('INSERT INTO short_links') ? rows([linkRow()]) : empty()));

    const link = await service.create(user as never, { destinationUrl: 'https://shop.example/pricing', slug: 'Launch', utmSource: 'twitter' });

    expect(link.shortUrl).toMatch(/\/l\/launch$/);
    const insert = db.queryCalls('INSERT INTO short_links')[0];
    expect(insert.values.slice(1, 5)).toEqual(['org_1', 'proj_1', 'launch', 'https://shop.example/pricing']);
  });

  it('explains a taken slug instead of silently picking another', async () => {
    const { service } = makeService(() => empty());
    await expect(
      service.create(user as never, { destinationUrl: 'https://shop.example', slug: 'launch' })
    ).rejects.toThrow('already taken');
  });

  it('rejects unsafe destinations', async () => {
    const { service } = makeService(() => empty());
    await expect(service.create(user as never, { destinationUrl: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

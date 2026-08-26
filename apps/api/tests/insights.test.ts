import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { InsightsService } from '../src/modules/insights/insights.service';
import { DigestService, buildDigestEmail, periodString } from '../src/modules/insights/digest.service';
import { AiService } from '../src/modules/ai/ai.service';
import { EmailService } from '../src/modules/emails/email.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { DashboardUser } from '../src/modules/auth/auth.service';
import { mockDatabase, rows, empty, affected } from './helpers/mock-db';

const PROJECT = {
  id: 'proj1',
  name: 'Acme App',
  slug: 'acme-app',
  organizationId: 'org1',
  organizationName: 'Acme Org',
  role: 'owner'
};

function setup(options: { aiNull?: boolean } = {}) {
  const db = mockDatabase((text) => {
    if (/SELECT count\(\*\)/.test(text)) return empty();
    if (/aggregate|::float AS "previousRevenue"/.test(text)) return empty();
    return empty();
  });

  const projects = {
    resolveActiveProject: vi.fn().mockResolvedValue(PROJECT)
  } as unknown as ProjectsService;

  const ai = {
    completeSafely: vi.fn().mockResolvedValue(options.aiNull ? null : 'Today is a big day for Acme App.')
  } as unknown as AiService;

  const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
  const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
  const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
  return { db, projects, ai, service, user };
}

describe('today story', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the template narrative when the AI is unavailable', async () => {
    const facts = {
      eventsToday: 120,
      eventsYesterday: 100,
      deltaPct: 20,
      uniquesToday: 34,
      topEvent: { name: 'signup', count: 9 },
      topCountry: { name: 'Brazil', count: 40, pct: 33 },
      topDevice: { name: 'mobile', count: 70 },
      activeNow: 3,
      lastEventAt: '2026-08-17T10:00:00.000Z'
    };

    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) {
        return rows([{ today: 120, yesterday: 100, uniques_today: 34, active_now: 3 }]);
      }
      if (/event_name AS name/.test(text)) return rows([{ name: 'signup', count: 9 }]);
      if (/unknown/.test(text) && /country/.test(text)) return rows([{ name: 'Brazil', count: 40 }]);
      if (/deviceType/.test(text)) return rows([{ name: 'mobile', count: 70 }]);
      if (/AS value FROM events/.test(text)) return rows([{ value: '2026-08-17T10:00:00.000Z' }]);
      return empty();
    });

    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) } as unknown as ProjectsService;
    const ai = { completeSafely: vi.fn().mockResolvedValue(null) } as unknown as AiService;
    const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
    const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };

    const result = await service.getTodayStory(user);

    expect(ai.completeSafely).toHaveBeenCalledTimes(1);
    expect(result.model).toBe('template');
    expect(result.narrative).toContain('Events are up 20% today');
    expect(result.narrative).toContain('signup');
    expect(result.narrative).toContain('Brazil');
    expect(result.narrative).toContain('3 actors are active');
  });

  it('returns the AI narrative when it succeeds', async () => {
    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) {
        return rows([{ today: 120, yesterday: 100, uniques_today: 34, active_now: 3 }]);
      }
      if (/event_name AS name/.test(text)) return rows([{ name: 'signup', count: 9 }]);
      if (/unknown/.test(text) && /country/.test(text)) return rows([{ name: 'Brazil', count: 40 }]);
      if (/deviceType/.test(text)) return rows([{ name: 'mobile', count: 70 }]);
      if (/AS value FROM events/.test(text)) return rows([{ value: '2026-08-17T10:00:00.000Z' }]);
      return empty();
    });

    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) } as unknown as ProjectsService;
    const ai = { completeSafely: vi.fn().mockResolvedValue('The story') } as unknown as AiService;
    const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
    const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };

    const result = await service.getTodayStory(user);

    expect(result.narrative).toBe('The story');
    expect(result.model).toBe('openai/gpt-oss-120b');
  });

  it('returns a no-data story without calling the AI', async () => {
    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) {
        return rows([{ today: 0, yesterday: 0, uniques_today: 0, active_now: 0 }]);
      }
      return empty();
    });

    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) } as unknown as ProjectsService;
    const ai = { completeSafely: vi.fn() } as unknown as AiService;
    const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
    const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };

    const result = await service.getTodayStory(user);

    expect(ai.completeSafely).not.toHaveBeenCalled();
    expect(result.narrative).toContain('No events today');
  });

  it('uses the active project from the project store', async () => {
    const db = mockDatabase();
    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) } as unknown as ProjectsService;
    const ai = { completeSafely: vi.fn() } as unknown as AiService;
    const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
    const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };

    const result = await service.getTodayStory(user);

    expect(result.project?.id).toBe('proj1');
    expect(result.project?.organizationName).toBe('Acme Org');
  });
});

describe('digest service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only to organizations that have not been digested this period', async () => {
    const db = mockDatabase((text) => {
      if (/SELECT DISTINCT/.test(text)) {
        return rows([{ organization_id: 'org1', organization_name: 'Acme Org' }]);
      }
      if (/SELECT id, name FROM organizations/.test(text)) {
        return rows([{ id: 'org1', name: 'Acme Org' }]);
      }
      if (/FROM projects p/.test(text)) {
        return rows([{ id: 'proj1', name: 'Acme App', events: 1000, previousEvents: 800, users: 50, sessions: 90, revenue: 5000, previousRevenue: 3000, transactions: 20 }]);
      }
      if (/FROM organization_members WHERE organization_id = \$1/.test(text)) {
        return rows([{ email: 'owner@acme.com' }, { email: 'eng@acme.com' }]);
      }
      return rows([]);
    });

    const email = {
      configured: true,
      send: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as EmailService;

    const service = new DigestService(db as unknown as DatabaseService, email);

    const result = await service.sendDueDigests('2026-08');

    expect(result.sent).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sendCall = vi.mocked(email.send).mock.calls[0][0];
    expect(sendCall.subject).toContain('Aug 2026');
    expect(sendCall.subject).toContain('Acme Org');
    expect(sendCall.html).toContain('Acme App');
    expect(db.queryCalls(/INSERT INTO email_digest_sends/).length).toBe(1);
  });

  it('skips organizations that already received the digest', async () => {
    const db = mockDatabase((text) => {
      if (/SELECT DISTINCT/.test(text)) return empty();
      return empty();
    });

    const email = {
      configured: true,
      send: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as EmailService;

    const service = new DigestService(db as unknown as DatabaseService, email);
    const result = await service.sendDueDigests('2026-08');

    expect(result.sent).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('builds a readable HTML digest for preview', () => {
    const payload = {
      organization: { id: 'org1', name: 'Acme Org' },
      period: '2026-08',
      generatedAt: '2026-08-17T10:00:00.000Z',
      projects: [
        {
          id: 'proj1',
          name: 'Acme App',
          events: 1000,
          previousEvents: 800,
          users: 50,
          sessions: 90,
          revenue: 5000,
          previousRevenue: 3000,
          transactions: 20,
          topEvent: 'signup',
          topCountry: 'US'
        }
      ]
    };

    const html = buildDigestEmail(payload);
    expect(html).toContain('Acme App');
    expect(html).toContain('1,000 events');
    expect(html).toContain('signup');
    expect(html).toContain('US');
    expect(html).toContain('Open dashboard');
  });

  it('derives the current period string', () => {
    expect(periodString(new Date('2026-08-17T10:00:00Z'))).toBe('2026-08');
    expect(periodString(new Date('2026-12-31T10:00:00Z'))).toBe('2026-12');
    expect(periodString(new Date('2026-01-05T10:00:00Z'))).toBe('2026-01');
  });
});

describe('now activity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns recent events with actor, path, country and device', async () => {
    const db = mockDatabase((text) => {
      if (/count\(\*\)::int AS total/.test(text)) {
        return rows([{ total: 5, uniques: 2 }]);
      }
      if (/event_name AS "eventName"/.test(text)) {
        return rows([
          {
            id: 'evt1',
            eventName: 'signup',
            actor: 'user_x',
            path: '/pricing',
            country: 'Brazil',
            device: 'mobile',
            occurredAt: '2026-08-17T10:00:00.000Z'
          }
        ]);
      }
      return empty();
    });

    const projects = { resolveActiveProject: vi.fn().mockResolvedValue(PROJECT) } as unknown as ProjectsService;
    const ai = {} as unknown as AiService;
    const digest = new DigestService(db as unknown as DatabaseService, {} as EmailService);
    const service = new InsightsService(db as unknown as DatabaseService, projects, ai, digest);
    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };

    const result = await service.getNowActivity(user, 'proj1', '15');

    expect(result.total).toBe(5);
    expect(result.uniques).toBe(2);
    expect(result.events[0].eventName).toBe('signup');
    expect(result.events[0].path).toBe('/pricing');
    expect(result.events[0].country).toBe('Brazil');
  });
});
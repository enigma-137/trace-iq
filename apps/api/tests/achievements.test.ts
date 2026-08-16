import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { AchievementsService } from '../src/modules/achievements/achievements.service';
import { EmailService } from '../src/modules/emails/email.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { DashboardUser } from '../src/modules/auth/auth.service';
import { mockDatabase, rows, empty, affected } from './helpers/mock-db';

const CATALOG_ROW = {
  id: 'achv_first_signal',
  slug: 'first-signal',
  title: 'First Signal',
  description: 'Track your first 100 events in a single project.',
  badge: '/achievements/first-signal.webp',
  category: 'Data',
  kind: 'one_time',
  metric: 'events.all_time',
  threshold: 100,
  hidden: false,
  sort_order: 10
};

interface SetupOptions {
  reachedAt?: string | null;
  unsentEmailRows?: Array<Record<string, unknown>>;
}

function setup(options: SetupOptions = {}) {
  const { reachedAt, unsentEmailRows } = options;
  const db = mockDatabase((text) => {
    if (/FROM achievements\s+WHERE hidden = false/.test(text)) return rows([CATALOG_ROW]);
    if (/COUNT\(\*\)::float8 AS value FROM events/.test(text)) return rows([{ value: 150 }]);
    if (/SELECT occurred_at AS value FROM events/.test(text)) {
      return rows([{ value: reachedAt ?? null }]);
    }
    if (/SELECT achievement_id, unlocked_at FROM achievement_unlocks/.test(text)) {
      return rows([{ achievement_id: 'achv_first_signal', unlocked_at: reachedAt ?? '2026-01-15T10:00:00.000Z' }]);
    }
    if (/SELECT user_id FROM organization_members WHERE organization_id = \$1/.test(text)) return rows([{ user_id: 'user1' }]);
    if (/UPDATE organization_members SET email/.test(text)) return affected(1);
    if (/email_sent_at IS NULL/.test(text)) return rows(unsentEmailRows ?? []);
    return empty();
  });

  const projects = {
    resolveActiveProject: vi.fn().mockResolvedValue({
      id: 'proj1',
      name: 'Proj',
      slug: 'proj',
      organizationId: 'org1',
      organizationName: 'Org',
      role: 'owner'
    })
  } as unknown as ProjectsService;

  const email = { send: vi.fn().mockResolvedValue({ ok: true }) } as unknown as EmailService;

  const service = new AchievementsService(db as unknown as DatabaseService, projects, email);
  const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
  return { db, email, service, user };
}

describe('achievement unlock dates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stamps a historical unlock with the true reached-at date and never emails it as new', async () => {
    const { db, email, service, user } = setup({ reachedAt: '2026-01-15T10:00:00.000Z' });

    const result = await service.list(user);

    const insert = db.queryCalls(/INSERT INTO achievement_unlocks/)[0];
    expect(insert).toBeTruthy();
    expect(insert.values).toEqual(['user1', 'achv_first_signal', '2026-01-15T10:00:00.000Z', expect.any(String)]);

    expect(result.achievements[0].unlocked).toBe(true);
    expect(result.achievements[0].unlockedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(email.send).not.toHaveBeenCalled();
  });

  it('leaves a genuinely fresh unlock un-notified so the email pipeline can send it', async () => {
    const reachedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { db, email, service, user } = setup({
      reachedAt,
      unsentEmailRows: [
        {
          user_id: 'user1',
          email: 'test@example.com',
          achievement_id: 'achv_first_signal',
          slug: 'first-signal',
          title: 'First Signal',
          description: 'Track your first 100 events in a single project.',
          category: 'Data'
        }
      ]
    });

    await service.list(user);

    const insert = db.queryCalls(/INSERT INTO achievement_unlocks/)[0];
    expect(insert).toBeTruthy();
    expect(insert.values).toEqual(['user1', 'achv_first_signal', reachedAt, null]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(email.send).toHaveBeenCalledTimes(1);
    const markSent = db.queryCalls(/SET email_sent_at = now()/)[0];
    expect(markSent).toBeTruthy();
  });
});
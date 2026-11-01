import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefsService } from '../src/modules/briefs/briefs.service';
import {
  briefWindowDays,
  buildBriefMessage,
  buildSlackBriefMessage,
  isBriefDue,
  localWeekday,
  suggestAction
} from '../src/modules/briefs/briefs.util';
import { InsightsService } from '../src/modules/insights/insights.service';
import { mockDatabase } from './helpers/mock-db';

const facts = (overrides: Partial<Parameters<typeof suggestAction>[0]> = {}) => ({
  eventsToday: 500,
  eventsYesterday: 400,
  deltaPct: 25,
  uniquesToday: 90,
  topEvent: null,
  topCountry: null,
  topDevice: null,
  activeNow: 0,
  lastEventAt: null,
  ...overrides
});

describe('weekly cadence timing', () => {
  const channel = { sendHour: 8, timezone: 'Africa/Lagos', lastSentOn: null as string | null };

  it('knows the weekday in the channel timezone', () => {
    // 2026-11-02 is a Monday. 23:30 UTC on Sunday the 1st is already Monday 00:30 in Lagos (UTC+1).
    expect(localWeekday(new Date('2026-11-01T12:00:00Z'), 'UTC')).toBe(7);
    expect(localWeekday(new Date('2026-11-01T23:30:00Z'), 'UTC')).toBe(7);
    expect(localWeekday(new Date('2026-11-01T23:30:00Z'), 'Africa/Lagos')).toBe(1);
    expect(localWeekday(new Date('2026-11-02T12:00:00Z'), 'UTC')).toBe(1);
  });

  it('sends a weekly brief on Monday only, but a daily brief every day', () => {
    const monday = new Date('2026-11-02T09:00:00Z'); // 10:00 Monday in Lagos
    const tuesday = new Date('2026-11-03T09:00:00Z');
    expect(isBriefDue(channel, monday, 'weekly').due).toBe(true);
    expect(isBriefDue(channel, tuesday, 'weekly').due).toBe(false);
    expect(isBriefDue(channel, tuesday, 'daily').due).toBe(true);
    expect(isBriefDue(channel, tuesday).due).toBe(true); // daily is the default
  });

  it('still waits for the send hour and does not repeat on the same Monday', () => {
    expect(isBriefDue(channel, new Date('2026-11-02T06:59:00Z'), 'weekly').due).toBe(false); // 07:59 in Lagos
    expect(isBriefDue({ ...channel, lastSentOn: '2026-11-02' }, new Date('2026-11-02T15:00:00Z'), 'weekly').due).toBe(false);
  });

  it('covers a week of data for weekly and a day for daily', () => {
    expect(briefWindowDays('weekly')).toBe(7);
    expect(briefWindowDays('daily')).toBe(1);
  });
});

describe('weekly message', () => {
  const input = {
    projectName: 'Nuwell AI Web',
    narrative: 'Events are up 25% this week.',
    facts: facts(),
    revenue: null,
    dashboardUrl: 'https://traceiq.run/dashboard',
    upgradeUrl: 'https://traceiq.run/dashboard/settings/billing'
  };

  it('is titled weekly and offers the upgrade, in Telegram and Slack', () => {
    const telegram = buildBriefMessage({ ...input, cadence: 'weekly' });
    expect(telegram).toContain('your weekly brief');
    expect(telegram).toContain('Want this every day? <a href="https://traceiq.run/dashboard/settings/billing">Upgrade to Pro</a>.');

    const slack = buildSlackBriefMessage({ ...input, cadence: 'weekly' });
    expect(slack).toContain('your weekly brief');
    expect(slack).toContain('Want this every day? <https://traceiq.run/dashboard/settings/billing|Upgrade to Pro>.');
  });

  it('never shows the upgrade line on a daily brief', () => {
    for (const message of [buildBriefMessage(input), buildSlackBriefMessage(input), buildBriefMessage({ ...input, cadence: 'daily' })]) {
      expect(message).toContain('your daily brief');
      expect(message).not.toContain('Upgrade to Pro');
    }
  });

  it('uses week wording in the warning', () => {
    const down = facts({ eventsToday: 100, eventsYesterday: 400, deltaPct: -75 });
    expect(suggestAction(down, null, 'weekly')).toContain('vs 400 the week before');
    expect(suggestAction(down, null, 'daily')).toContain('vs 400 the day before');
    const payments = { total: 0, transactions: 2, failed: 5, currency: 'NGN' };
    expect(suggestAction(facts(), payments, 'weekly')).toContain('in the last 7 days');
    expect(suggestAction(facts(), payments, 'daily')).toContain('in the last 24 hours');
  });
});

describe('plan decides the cadence', () => {
  const telegram = { isConfigured: true, botUsername: 'traceiq_bot', sendMessage: vi.fn(), setWebhook: vi.fn() };
  const slack = { isConfigured: true, authorizeUrl: vi.fn(), exchangeCode: vi.fn(), sendMessage: vi.fn() };
  const insights = { getProjectStory: vi.fn() };
  const projects = { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() };
  const entitlements = { getSnapshot: vi.fn() };
  const channel = {
    id: 'brc_1',
    projectId: 'proj_1',
    kind: 'telegram',
    chatId: '555',
    chatName: 'Emmanuel',
    enabled: true,
    sendHour: 8,
    timezone: 'UTC',
    lastSentOn: null,
    lastError: null
  };

  beforeEach(() => {
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    insights.getProjectStory.mockReset().mockResolvedValue({ facts: facts(), narrative: 'Fine.' });
    entitlements.getSnapshot.mockReset().mockResolvedValue({ plan: 'free' });
  });
  afterEach(() => vi.useRealTimers());

  function service() {
    const db = mockDatabase((text) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [channel], rowCount: 1 };
      if (/UPDATE brief_channels SET last_sent_on = \$2::date, updated_at/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM projects WHERE id/.test(text)) return { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    return { db, service: new BriefsService(db as never, projects as never, insights as never, telegram as never, slack as never, entitlements as never) };
  }

  it('sends nothing to a Free project on a Tuesday, and does not use up the day', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-03T09:00:00Z'));
    const { db, service: s } = service();
    expect(await s.sendDueBriefs()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(db.queryCalls(/UPDATE brief_channels SET last_sent_on/)).toHaveLength(0);
  });

  it('sends a Free project a weekly brief on Monday, covering 7 days, with the upgrade line', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-02T09:00:00Z'));
    const { service: s } = service();
    expect(await s.sendDueBriefs()).toBe(1);
    expect(insights.getProjectStory).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_1' }), 7);
    const message = telegram.sendMessage.mock.calls[0][1] as string;
    expect(message).toContain('your weekly brief');
    expect(message).toContain('Upgrade to Pro');
  });

  it('keeps sending a Pro project a daily brief, any day, covering 1 day', async () => {
    entitlements.getSnapshot.mockResolvedValue({ plan: 'pro' });
    vi.useFakeTimers().setSystemTime(new Date('2026-11-03T09:00:00Z'));
    const { service: s } = service();
    expect(await s.sendDueBriefs()).toBe(1);
    expect(insights.getProjectStory).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_1' }), 1);
    const message = telegram.sendMessage.mock.calls[0][1] as string;
    expect(message).toContain('your daily brief');
    expect(message).not.toContain('Upgrade to Pro');
  });

  it('treats self-hosted installs as unrestricted', async () => {
    entitlements.getSnapshot.mockResolvedValue({ plan: 'self_hosted' });
    expect(await service().service.cadenceFor('proj_1')).toBe('daily');
  });

  it('never downgrades someone because the plan lookup failed', async () => {
    entitlements.getSnapshot.mockRejectedValue(new Error('billing is down'));
    const { service: s } = service();
    expect(await s.cadenceFor('proj_1')).toBe('daily');
    // A failure is not remembered: the next call tries again.
    entitlements.getSnapshot.mockResolvedValue({ plan: 'free' });
    expect(await s.cadenceFor('proj_1')).toBe('weekly');
  });

  it('remembers the plan briefly so the scheduler does not query billing every minute', async () => {
    const { service: s } = service();
    await s.cadenceFor('proj_1');
    await s.cadenceFor('proj_1');
    await s.cadenceFor('proj_1');
    expect(entitlements.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reports the cadence to the dashboard', async () => {
    projects.requireActiveProject.mockResolvedValue({ id: 'proj_1', name: 'Nuwell' });
    const { service: s } = service();
    const overview = await s.getOverview({ id: 'usr_1', email: 'a@b.co', authMethod: 'session' } as never, 'proj_1');
    expect(overview.cadence).toBe('weekly');
  });
});

describe('weekly story', () => {
  function insights(rows: { today: number; yesterday: number }) {
    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) return { rows: [{ today: rows.today, yesterday: rows.yesterday, uniques_today: 40, active_now: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const ai = { generateStoryNarrative: vi.fn().mockResolvedValue('AI wrote this about the last 24 hours.') };
    return { db, ai, service: new InsightsService(db as never, {} as never, ai as never, {} as never) };
  }

  it('compares 7 days with the 7 before, in week wording, without asking the AI', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-02T08:00:00Z'));
    const { db, ai, service } = insights({ today: 700, yesterday: 500 });
    const story = await service.getProjectStory({ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }, 7);

    expect(ai.generateStoryNarrative).not.toHaveBeenCalled();
    expect(story.narrative).toContain('this week');
    expect(story.narrative).toContain('last week');
    expect(story.narrative).not.toMatch(/today|yesterday|24 hours/);

    const totals = db.calls.find((call) => /AS today/.test(call.text))!;
    const [, windowStart, previousStart] = totals.values as string[];
    const day = 24 * 60 * 60 * 1000;
    expect(Date.now() - new Date(windowStart).getTime()).toBe(7 * day);
    expect(Date.now() - new Date(previousStart).getTime()).toBe(14 * day);
    vi.useRealTimers();
  });

  it('keeps the daily story as it was, with the AI narrative', async () => {
    const { ai, service } = insights({ today: 700, yesterday: 500 });
    const story = await service.getProjectStory({ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' });
    expect(ai.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(story.narrative).toBe('AI wrote this about the last 24 hours.');
  });

  it('reports a quiet week in week wording', async () => {
    const { service } = insights({ today: 0, yesterday: 0 });
    const story = await service.getProjectStory({ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }, 7);
    expect(story.narrative).toBe('No events this week. As soon as your SDK starts sending, the story of your week shows up here.');
  });
});

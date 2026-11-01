import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefsService } from '../src/modules/briefs/briefs.service';
import {
  buildBriefMessage,
  hashLinkCode,
  isBriefDue,
  isQuietDay,
  isValidTimezone,
  localDateAndHour,
  newLinkCode,
  suggestAction
} from '../src/modules/briefs/briefs.util';
import { mockDatabase } from './helpers/mock-db';

const facts = (overrides: Partial<Parameters<typeof suggestAction>[0]> = {}) => ({
  eventsToday: 120,
  eventsYesterday: 100,
  deltaPct: 20,
  uniquesToday: 40,
  topEvent: { name: 'signup', count: 12 },
  topCountry: { name: 'NG', count: 90, pct: 75 },
  topDevice: { name: 'mobile', count: 80 },
  activeNow: 3,
  lastEventAt: null,
  ...overrides
});

describe('brief timing', () => {
  it('reads the local date and hour in a timezone', () => {
    // 23:30 UTC on the 1st is already 00:30 on the 2nd in Lagos (UTC+1).
    const now = new Date('2026-11-01T23:30:00Z');
    expect(localDateAndHour(now, 'UTC')).toEqual({ date: '2026-11-01', hour: 23 });
    expect(localDateAndHour(now, 'Africa/Lagos')).toEqual({ date: '2026-11-02', hour: 0 });
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(localDateAndHour(new Date('2026-11-01T05:00:00Z'), 'Mars/Olympus').hour).toBe(5);
  });

  it('is due from the send hour until it is sent, once per local day', () => {
    const channel = { sendHour: 8, timezone: 'Africa/Lagos', lastSentOn: null as string | null };
    expect(isBriefDue(channel, new Date('2026-11-01T06:59:00Z')).due).toBe(false); // 07:59 in Lagos
    expect(isBriefDue(channel, new Date('2026-11-01T07:00:00Z'))).toEqual({ due: true, localDate: '2026-11-01' });
    // Still due later the same day if a restart skipped the exact hour.
    expect(isBriefDue(channel, new Date('2026-11-01T15:00:00Z')).due).toBe(true);
    expect(isBriefDue({ ...channel, lastSentOn: '2026-11-01' }, new Date('2026-11-01T15:00:00Z')).due).toBe(false);
    expect(isBriefDue({ ...channel, lastSentOn: '2026-11-01' }, new Date('2026-11-02T07:00:00Z')).due).toBe(true);
  });
});

describe('link codes', () => {
  it('makes unguessable single-use codes and stores only a hash', () => {
    const a = newLinkCode();
    const b = newLinkCode();
    expect(a.code).not.toBe(b.code);
    expect(a.code).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    expect(a.hash).toBe(hashLinkCode(a.code));
    expect(a.hash).not.toContain(a.code);
  });
});

describe('brief message', () => {
  it('says nothing on a quiet project', () => {
    expect(isQuietDay(facts({ eventsToday: 0, eventsYesterday: 0 }))).toBe(true);
    expect(isQuietDay(facts())).toBe(false);
  });

  it('suggests an action only when something stands out', () => {
    expect(suggestAction(facts(), null)).toBeNull();
    expect(suggestAction(facts({ deltaPct: -40 }), null)).toContain('down 40%');
    expect(suggestAction(facts({ deltaPct: 80 }), null)).toContain('75% from NG');
    // Too little traffic yesterday for a percentage to mean anything.
    expect(suggestAction(facts({ deltaPct: -90, eventsYesterday: 5 }), null)).toBeNull();
    expect(suggestAction(facts(), { total: 5000, transactions: 4, failed: 6, currency: 'NGN' })).toContain('6 of 10 payments failed');
    expect(suggestAction(facts(), { total: 5000, transactions: 9, failed: 1, currency: 'NGN' })).toBeNull();
  });

  it('escapes project names and includes revenue when it is on', () => {
    const message = buildBriefMessage({
      projectName: 'Nu<well> & Co',
      narrative: 'Events are up 20% today.',
      facts: facts(),
      revenue: { total: 7000, transactions: 2, failed: 1, currency: 'NGN' },
      dashboardUrl: 'https://traceiq.run/dashboard'
    });
    expect(message).toContain('<b>Nu&lt;well&gt; &amp; Co</b>');
    expect(message).toContain('Revenue: ₦7,000 · 2 paid · 1 failed');
    expect(message).toContain('<a href="https://traceiq.run/dashboard">Open TraceIQ</a>');
  });
});

describe('BriefsService', () => {
  const telegram = {
    isConfigured: true,
    botUsername: 'traceiq_bot',
    sendMessage: vi.fn(),
    setWebhook: vi.fn()
  };
  const slack = { isConfigured: true, authorizeUrl: vi.fn(), exchangeCode: vi.fn(), sendMessage: vi.fn() };
  const entitlements = { getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro' }) };
  const insights = { getProjectStory: vi.fn() };
  const projects = { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() };
  const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'session' };

  beforeEach(() => {
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    insights.getProjectStory.mockReset().mockResolvedValue({ facts: facts(), narrative: 'All good.' });
    projects.requireWritableProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Nuwell' });
  });
  afterEach(() => vi.useRealTimers());

  const channelRow = {
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

  function service(onQuery: Parameters<typeof mockDatabase>[0]) {
    const db = mockDatabase(onQuery);
    return { db, service: new BriefsService(db as never, projects as never, insights as never, telegram as never, slack as never, entitlements as never) };
  }

  it('sends one brief per channel, claiming the day before sending', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    const { db, service: s } = service((text) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [channelRow], rowCount: 1 };
      if (/UPDATE brief_channels SET last_sent_on/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM projects WHERE id/.test(text)) return { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    expect(await s.sendDueBriefs()).toBe(1);
    expect(telegram.sendMessage).toHaveBeenCalledWith('555', expect.stringContaining('<b>Nuwell</b> · your daily brief'));
    const claimIndex = db.calls.findIndex((c) => /UPDATE brief_channels SET last_sent_on/.test(c.text));
    expect(claimIndex).toBeGreaterThan(-1);
    expect(db.calls[claimIndex].values).toEqual(['brc_1', '2026-11-01']);
  });

  it('does not send when another replica already claimed today', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    const { service: s } = service((text) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [channelRow], rowCount: 1 };
      return { rows: [], rowCount: 0 }; // the claim updates no rows
    });
    expect(await s.sendDueBriefs()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips a quiet project without a message', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    insights.getProjectStory.mockResolvedValue({ facts: facts({ eventsToday: 0, eventsYesterday: 0 }), narrative: 'No events today.' });
    const { service: s } = service((text) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [channelRow], rowCount: 1 };
      if (/UPDATE brief_channels SET last_sent_on/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM projects WHERE id/.test(text)) return { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    expect(await s.sendDueBriefs()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('disables a channel when Telegram says the chat is gone, and retries on a temporary failure', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    const route = (text: string) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [channelRow], rowCount: 1 };
      if (/UPDATE brief_channels SET last_sent_on = \$2::date, updated_at/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM projects WHERE id/.test(text)) return { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };

    telegram.sendMessage.mockResolvedValue({ ok: false, status: 403, description: 'bot was blocked by the user', permanent: true });
    const blocked = service(route);
    expect(await blocked.service.sendDueBriefs()).toBe(0);
    expect(blocked.db.queryCalls(/SET enabled = false, last_error/)).toHaveLength(1);

    telegram.sendMessage.mockResolvedValue({ ok: false, status: 502, description: 'bad gateway', permanent: false });
    const temporary = service(route);
    await temporary.service.sendDueBriefs();
    expect(temporary.db.queryCalls(/SET enabled = false/)).toHaveLength(0);
    expect(temporary.db.queryCalls(/SET last_sent_on = \$3::date, last_error/)).toHaveLength(1);
  });

  it('connects a chat with a valid code and sends a first brief', async () => {
    const { db, service: s } = service((text) => {
      if (/DELETE FROM brief_link_codes WHERE code_hash/.test(text)) {
        return {
          rows: [{ projectId: 'proj_1', userId: 'usr_1', timezone: 'Africa/Lagos', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
          rowCount: 1
        };
      }
      if (/SELECT name FROM projects/.test(text)) return { rows: [{ name: 'Nuwell' }], rowCount: 1 };
      if (/INSERT INTO brief_channels/.test(text)) return { rows: [channelRow], rowCount: 1 };
      if (/FROM projects WHERE id/.test(text)) return { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await s.handleTelegramUpdate({ message: { text: '/start abc123', chat: { id: 555, type: 'private', first_name: 'Emmanuel' } } });

    expect(db.queryCalls(/INSERT INTO brief_channels/)).toHaveLength(1);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Connected to <b>Nuwell</b>');
  });

  it('rejects an expired or unknown code without linking anything', async () => {
    const { db, service: s } = service(() => ({ rows: [], rowCount: 0 }));
    await s.handleTelegramUpdate({ message: { text: '/start nope', chat: { id: 555, type: 'private' } } });
    expect(db.queryCalls(/INSERT INTO brief_channels/)).toHaveLength(0);
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('expired');
  });

  it('ignores channel posts and plain text', async () => {
    const { service: s } = service(() => ({ rows: [], rowCount: 0 }));
    await s.handleTelegramUpdate({ message: { text: '/start abc', chat: { id: 1, type: 'channel' } } });
    await s.handleTelegramUpdate({ message: { text: 'hello', chat: { id: 1, type: 'private' } } });
    await s.handleTelegramUpdate({});
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('validates the send hour and timezone when updating a channel', async () => {
    const { service: s } = service((text) => {
      if (/FROM brief_channels WHERE id/.test(text)) return { rows: [channelRow], rowCount: 1 };
      return { rows: [channelRow], rowCount: 1 };
    });
    await expect(s.updateChannel(user as never, 'brc_1', { sendHour: 24 })).rejects.toThrow('0 to 23');
    await expect(s.updateChannel(user as never, 'brc_1', { sendHour: 7.5 })).rejects.toThrow('0 to 23');
    await expect(s.updateChannel(user as never, 'brc_1', { timezone: 'Nowhere/Land' })).rejects.toThrow('timezone');
    await expect(s.updateChannel(user as never, 'brc_1', { enabled: 'yes' })).rejects.toThrow('true or false');
    await expect(s.updateChannel(user as never, 'brc_1', { sendHour: 18 })).resolves.toBeTruthy();
  });

  it('only creates a link for a project the user can write to', async () => {
    projects.requireWritableProject.mockRejectedValue(new Error('read-only'));
    const { service: s } = service(() => ({ rows: [], rowCount: 0 }));
    await expect(s.createTelegramLink(user as never, 'proj_1')).rejects.toThrow('read-only');
  });

  it('refuses to make a link when the bot is not configured', async () => {
    const off = new BriefsService(mockDatabase() as never, projects as never, insights as never, { ...telegram, isConfigured: false } as never, slack as never, entitlements as never);
    await expect(off.createTelegramLink(user as never, 'proj_1')).rejects.toThrow('not set up');
  });
});

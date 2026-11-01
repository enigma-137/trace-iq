import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefsService } from '../src/modules/briefs/briefs.service';
import { buildSlackBriefMessage, escapeSlack } from '../src/modules/briefs/briefs.util';
import { SlackClient, isSlackWebhookUrl } from '../src/modules/briefs/slack.client';
import { mockDatabase } from './helpers/mock-db';

const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'session' };
const install = {
  webhookUrl: 'https://hooks.slack.com/services/T000/B000/secret',
  channelId: 'C123',
  channelName: 'growth',
  teamName: 'Nuwell'
};
const slackChannel = {
  id: 'brc_s1',
  projectId: 'proj_1',
  kind: 'slack',
  chatId: 'C123',
  chatName: '#growth (Nuwell)',
  enabled: true,
  sendHour: 8,
  timezone: 'UTC',
  lastSentOn: null,
  lastError: null
};
const telegramChannel = { ...slackChannel, id: 'brc_t1', kind: 'telegram', chatId: '555', chatName: 'Emmanuel' };
const facts = {
  eventsToday: 120,
  eventsYesterday: 100,
  deltaPct: 20,
  uniquesToday: 40,
  topEvent: null,
  topCountry: null,
  topDevice: null,
  activeNow: 0,
  lastEventAt: null
};

describe('Slack message', () => {
  it('uses Slack mrkdwn and escapes characters Slack treats as markup', () => {
    const message = buildSlackBriefMessage({
      projectName: 'Nu<well> & Co',
      narrative: 'Up 20% today.',
      facts,
      revenue: { total: 7000, transactions: 2, failed: 1, currency: 'NGN' },
      dashboardUrl: 'https://traceiq.run/dashboard'
    });
    expect(message).toContain('*Nu&lt;well&gt; &amp; Co* · your daily brief');
    expect(message).toContain('Revenue: ₦7,000 · 2 paid · 1 failed');
    expect(message).toContain('<https://traceiq.run/dashboard|Open TraceIQ>');
    expect(escapeSlack('<!channel> & more')).toBe('&lt;!channel&gt; &amp; more');
  });
});

describe('SlackClient', () => {
  const client = new SlackClient();
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.SLACK_CLIENT_ID = 'client-id';
    process.env.SLACK_CLIENT_SECRET = 'client-secret';
    delete process.env.SLACK_REDIRECT_URL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
  });

  it('only accepts real Slack webhook URLs', () => {
    expect(isSlackWebhookUrl(install.webhookUrl)).toBe(true);
    expect(isSlackWebhookUrl('http://hooks.slack.com/services/T/B/x')).toBe(false);
    expect(isSlackWebhookUrl('https://hooks.slack.com.evil.test/services/T/B/x')).toBe(false);
    expect(isSlackWebhookUrl('https://evil.test/services/T/B/x')).toBe(false);
    expect(isSlackWebhookUrl('https://hooks.slack.com/other')).toBe(false);
    expect(isSlackWebhookUrl(undefined)).toBe(false);
  });

  it('builds the Add to Slack URL with the webhook scope, redirect and our state', () => {
    const url = new URL(client.authorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(url.searchParams.get('scope')).toBe('incoming-webhook');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.traceiq.run/v1/integrations/slack/callback');
    expect(client.isConfigured).toBe(true);
  });

  it('is not configured without both the client id and secret', () => {
    delete process.env.SLACK_CLIENT_SECRET;
    expect(client.isConfigured).toBe(false);
  });

  it('exchanges the code for the channel webhook', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        team: { name: 'Nuwell' },
        incoming_webhook: { url: install.webhookUrl, channel: '#growth', channel_id: 'C123' }
      })
    });
    expect(await client.exchangeCode('abc')).toEqual({
      install: { webhookUrl: install.webhookUrl, channelId: 'C123', channelName: '#growth', teamName: 'Nuwell' }
    });
  });

  it('rejects an exchange that returns an error or a webhook on another host', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ ok: false, error: 'invalid_code' }) });
    expect(await client.exchangeCode('abc')).toEqual({ error: 'invalid_code' });

    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, incoming_webhook: { url: 'https://evil.test/hook', channel_id: 'C1' } })
    });
    expect(await client.exchangeCode('abc')).toEqual({ error: 'invalid_response' });

    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await client.exchangeCode('abc')).toEqual({ error: 'network_error' });
  });

  it('treats revoked webhooks as permanent and rate limits as temporary', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await client.sendMessage(install.webhookUrl, 'hi')).toMatchObject({ ok: true });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'no_service' });
    expect(await client.sendMessage(install.webhookUrl, 'hi')).toMatchObject({ ok: false, permanent: true, description: 'no_service' });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate_limited' });
    expect(await client.sendMessage(install.webhookUrl, 'hi')).toMatchObject({ ok: false, permanent: false });

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await client.sendMessage(install.webhookUrl, 'hi')).toMatchObject({ ok: false, permanent: false });
  });

  it('never posts to a URL that is not a Slack webhook', async () => {
    const result = await client.sendMessage('https://evil.test/steal', 'hi');
    expect(result).toMatchObject({ ok: false, permanent: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('BriefsService with Slack', () => {
  const telegram = { isConfigured: true, botUsername: 'traceiq_bot', sendMessage: vi.fn(), setWebhook: vi.fn() };
  const slack = {
    isConfigured: true,
    authorizeUrl: vi.fn((state: string) => `https://slack.com/oauth/v2/authorize?scope=incoming-webhook&state=${state}`),
    exchangeCode: vi.fn(),
    sendMessage: vi.fn()
  };
  const entitlements = { getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro' }) };
  const insights = { getProjectStory: vi.fn() };
  const projects = { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() };

  beforeEach(() => {
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    slack.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    slack.exchangeCode.mockReset();
    slack.isConfigured = true;
    insights.getProjectStory.mockReset().mockResolvedValue({ facts, narrative: 'All good.' });
    projects.requireWritableProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Nuwell' });
    projects.requireActiveProject.mockReset().mockResolvedValue({ id: 'proj_1', name: 'Nuwell' });
  });
  afterEach(() => vi.useRealTimers());

  function service(onQuery: Parameters<typeof mockDatabase>[0], telegramOverride: Partial<typeof telegram> = {}) {
    const db = mockDatabase(onQuery);
    return {
      db,
      service: new BriefsService(db as never, projects as never, insights as never, { ...telegram, ...telegramOverride } as never, slack as never, entitlements as never)
    };
  }

  const project = (text: string) =>
    /FROM projects WHERE id/.test(text) ? { rows: [{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }], rowCount: 1 } : null;
  const unused = { rows: [], rowCount: 0 };
  const futureCode = () => ({
    rows: [{ projectId: 'proj_1', userId: 'usr_1', timezone: 'Africa/Lagos', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    rowCount: 1
  });

  it('makes an Add to Slack link whose code is stored only as a hash, and refuses when Slack is off', async () => {
    const { db, service: s } = service(() => unused);
    const link = await s.createSlackLink(user as never, 'proj_1', 'Africa/Lagos');

    const code = new URL(link.url).searchParams.get('state') as string;
    const insert = db.queryCalls(/INSERT INTO brief_link_codes/)[0];
    expect(insert.values[3]).toBe('slack');
    expect(insert.values[4]).toBe('Africa/Lagos');
    expect(insert.values[0]).not.toBe(code);
    expect(insert.values[0]).toMatch(/^[0-9a-f]{64}$/);

    slack.isConfigured = false;
    await expect(s.createSlackLink(user as never, 'proj_1')).rejects.toThrow('not set up');
  });

  it('connects a channel when Slack redirects back, then sends a first brief to it', async () => {
    slack.exchangeCode.mockResolvedValue({ install });
    const { db, service: s } = service((text) => {
      if (/DELETE FROM brief_link_codes/.test(text)) return futureCode();
      if (/INSERT INTO brief_channels/.test(text)) return { rows: [slackChannel], rowCount: 1 };
      if (/SELECT webhook_url/.test(text)) return { rows: [{ webhookUrl: install.webhookUrl }], rowCount: 1 };
      return project(text) ?? unused;
    });

    const url = await s.finishSlackInstall({ code: 'slack-code', state: 'our-state' });

    expect(url).toMatch(/\/dashboard\/alerts\?tab=brief&slack=connected$/);
    // A Telegram code can never complete a Slack install: the redeem is scoped to 'slack'.
    expect(db.queryCalls(/DELETE FROM brief_link_codes/)[0].values[1]).toBe('slack');
    const insert = db.queryCalls(/INSERT INTO brief_channels/)[0];
    expect(insert.values).toContain(install.webhookUrl);
    expect(insert.values).toContain('#growth (Nuwell)');
    expect(slack.sendMessage).toHaveBeenCalledWith(install.webhookUrl, expect.stringContaining('*Nuwell* · your daily brief'));
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sends the person back with a reason when the link expired, was cancelled, or Slack refuses', async () => {
    const expired = service(() => unused);
    expect(await expired.service.finishSlackInstall({ code: 'c', state: 'old' })).toMatch(/slack=expired$/);
    expect(slack.exchangeCode).not.toHaveBeenCalled();

    const idle = service(() => unused);
    expect(await idle.service.finishSlackInstall({ error: 'access_denied' })).toMatch(/slack=cancelled$/);
    expect(await idle.service.finishSlackInstall({})).toMatch(/slack=error$/);
    expect(idle.db.calls).toHaveLength(0);

    slack.exchangeCode.mockResolvedValue({ error: 'invalid_code' });
    const refused = service((text) => (/DELETE FROM brief_link_codes/.test(text) ? futureCode() : unused));
    expect(await refused.service.finishSlackInstall({ code: 'c', state: 's' })).toMatch(/slack=error$/);
    expect(refused.db.queryCalls(/INSERT INTO brief_channels/)).toHaveLength(0);
  });

  it('delivers a due Slack brief without a Telegram bot, and skips Telegram channels when the bot is off', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    const off = { isConfigured: false, sendMessage: vi.fn() };
    const { service: s } = service(
      (text) => {
        if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [telegramChannel, slackChannel], rowCount: 2 };
        if (/UPDATE brief_channels SET last_sent_on = \$2::date, updated_at/.test(text)) return { rows: [], rowCount: 1 };
        if (/SELECT webhook_url/.test(text)) return { rows: [{ webhookUrl: install.webhookUrl }], rowCount: 1 };
        return project(text) ?? unused;
      },
      off
    );

    expect(await s.sendDueBriefs()).toBe(1);
    expect(slack.sendMessage).toHaveBeenCalledTimes(1);
    expect(off.sendMessage).not.toHaveBeenCalled();
  });

  it('switches a Slack channel off when its webhook is revoked, and retries through a temporary error', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'));
    const route = (text: string) => {
      if (/FROM brief_channels WHERE enabled/.test(text)) return { rows: [slackChannel], rowCount: 1 };
      if (/UPDATE brief_channels SET last_sent_on = \$2::date, updated_at/.test(text)) return { rows: [], rowCount: 1 };
      if (/SELECT webhook_url/.test(text)) return { rows: [{ webhookUrl: install.webhookUrl }], rowCount: 1 };
      return project(text) ?? unused;
    };

    slack.sendMessage.mockResolvedValue({ ok: false, status: 404, description: 'no_service', permanent: true });
    const revoked = service(route);
    await revoked.service.sendDueBriefs();
    expect(revoked.db.queryCalls(/SET enabled = false, last_error/)).toHaveLength(1);

    slack.sendMessage.mockResolvedValue({ ok: false, status: 429, description: 'rate_limited', permanent: false });
    const busy = service(route);
    await busy.service.sendDueBriefs();
    expect(busy.db.queryCalls(/SET enabled = false/)).toHaveLength(0);
    expect(busy.db.queryCalls(/SET last_sent_on = \$3::date, last_error/)).toHaveLength(1);
  });

  it('lists every destination without ever returning a webhook URL', async () => {
    const { db, service: s } = service(() => ({ rows: [telegramChannel, slackChannel], rowCount: 2 }));
    const overview = await s.getOverview(user as never, 'proj_1');
    expect(overview.slack.configured).toBe(true);
    expect(overview.telegram.botUsername).toBe('traceiq_bot');
    expect(overview.channels).toHaveLength(2);
    expect(db.calls[0].text).not.toContain('webhook_url');
  });
});

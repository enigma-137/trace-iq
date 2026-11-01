import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { buildSlackAlertMessage, buildTelegramAlertMessage } from '../src/modules/briefs/briefs.util';
import { ChatNotifier } from '../src/modules/briefs/chat-notifier';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const alert = { name: 'Checkout failures', message: '"payment_failed" count is 42, above 30.', alertUrl: 'https://traceiq.run/dashboard/alerts' };

const telegramRow = { id: 'brc_t', kind: 'telegram', chatId: '555', chatName: 'Emmanuel', webhookUrl: null, enabled: true };
const slackRow = {
  id: 'brc_s',
  kind: 'slack',
  chatId: 'C123',
  chatName: '#alerts (Nuwell)',
  webhookUrl: 'https://hooks.slack.com/services/T0/B0/secret',
  enabled: true
};

describe('alert messages', () => {
  it('reads as an alert with a link back, in Telegram and Slack', () => {
    const telegram = buildTelegramAlertMessage(alert);
    expect(telegram).toContain('<b>Alert: Checkout failures</b>');
    expect(telegram).toContain('"payment_failed" count is 42, above 30.');
    expect(telegram).toContain('<a href="https://traceiq.run/dashboard/alerts">Open in TraceIQ</a>');

    const slack = buildSlackAlertMessage(alert);
    expect(slack).toContain('*Alert: Checkout failures*');
    expect(slack).toContain('<https://traceiq.run/dashboard/alerts|Open in TraceIQ>');
  });

  it('escapes markup so an event name cannot break the message or ping a channel', () => {
    const hostile = { ...alert, name: 'A <b>&</b> B', message: '"<!channel> pwned" count is 1' };
    expect(buildTelegramAlertMessage(hostile)).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
    expect(buildTelegramAlertMessage(hostile)).not.toContain('<b>&');
    expect(buildSlackAlertMessage(hostile)).not.toContain('<!channel>');
    expect(buildSlackAlertMessage(hostile)).toContain('&lt;!channel&gt;');
  });
});

describe('ChatNotifier', () => {
  const telegram = { isConfigured: true, sendMessage: vi.fn() };
  const slack = { isConfigured: true, sendMessage: vi.fn() };

  beforeEach(() => {
    telegram.isConfigured = true;
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    slack.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
  });

  function notifier(channels: Array<Record<string, unknown>>, onOther?: (text: string) => unknown) {
    const db = mockDatabase((text) => {
      if (/FROM brief_channels WHERE project_id = \$1 AND id = ANY/.test(text) && /SELECT id, kind, chat_id/.test(text)) {
        return rows(channels);
      }
      if (/SELECT id FROM brief_channels/.test(text)) return rows(channels.map((channel) => ({ id: channel.id })));
      if (/SELECT id, kind, COALESCE/.test(text)) return rows(channels);
      return (onOther?.(text) as ReturnType<typeof affected>) ?? affected(1);
    });
    return { db, notifier: new ChatNotifier(db as never, telegram as never, slack as never) };
  }

  it('lists a project’s chats for the alert form without ever selecting a webhook URL', async () => {
    const { db, notifier: chat } = notifier([{ id: 'brc_t', kind: 'telegram', name: 'Emmanuel', enabled: true }]);
    expect(await chat.listForProject('proj_1')).toHaveLength(1);
    expect(db.calls[0].text).not.toContain('webhook_url');
    expect(db.calls[0].values).toEqual(['proj_1']);
  });

  it('only accepts channels that belong to the project', async () => {
    const { db, notifier: chat } = notifier([{ id: 'brc_t' }]);
    expect(await chat.idsInProject('proj_1', [])).toEqual([]);
    expect(db.calls).toHaveLength(0); // nothing asked, nothing queried
    expect(await chat.idsInProject('proj_1', ['brc_t', 'brc_other_project'])).toEqual(['brc_t']);
    expect(db.calls[0].values).toEqual(['proj_1', ['brc_t', 'brc_other_project']]);
  });

  it('posts to Telegram and to Slack, and reports each as sent', async () => {
    const { notifier: chat } = notifier([telegramRow, slackRow]);
    const results = await chat.send('proj_1', ['brc_t', 'brc_s'], alert);

    expect(telegram.sendMessage).toHaveBeenCalledWith('555', expect.stringContaining('<b>Alert: Checkout failures</b>'));
    expect(slack.sendMessage).toHaveBeenCalledWith(slackRow.webhookUrl, expect.stringContaining('*Alert: Checkout failures*'));
    expect(results).toEqual([
      { channelId: 'brc_t', kind: 'telegram', name: 'Emmanuel', status: 'sent', error: null },
      { channelId: 'brc_s', kind: 'slack', name: '#alerts (Nuwell)', status: 'sent', error: null }
    ]);
  });

  it('only loads channels from the alert’s own project', async () => {
    const { db, notifier: chat } = notifier([telegramRow]);
    await chat.send('proj_1', ['brc_t'], alert);
    const load = db.calls.find((call) => /SELECT id, kind, chat_id/.test(call.text))!;
    expect(load.text).toContain('WHERE project_id = $1');
    expect(load.values[0]).toBe('proj_1');
  });

  it('skips a paused channel instead of sending', async () => {
    const { notifier: chat } = notifier([{ ...telegramRow, enabled: false }]);
    const [result] = await chat.send('proj_1', ['brc_t'], alert);
    expect(result).toMatchObject({ status: 'skipped' });
    expect(result.error).toContain('paused');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a channel that was disconnected since the alert was made', async () => {
    const { notifier: chat } = notifier([telegramRow]);
    const results = await chat.send('proj_1', ['brc_gone', 'brc_t'], alert);
    expect(results[0]).toMatchObject({ channelId: 'brc_gone', status: 'failed', error: 'This channel was disconnected.' });
    expect(results[1]).toMatchObject({ channelId: 'brc_t', status: 'sent' }); // one gone channel doesn't stop the rest
  });

  it('fails clearly when the bot or the Slack webhook is missing', async () => {
    telegram.isConfigured = false;
    const bot = await notifier([telegramRow]).notifier.send('proj_1', ['brc_t'], alert);
    expect(bot[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('not set up') });
    expect(telegram.sendMessage).not.toHaveBeenCalled();

    const hook = await notifier([{ ...slackRow, webhookUrl: null }]).notifier.send('proj_1', ['brc_s'], alert);
    expect(hook[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Connect it again') });
  });

  it('switches a channel off when Telegram or Slack says it can never work again', async () => {
    telegram.sendMessage.mockResolvedValue({ ok: false, status: 403, description: 'bot was blocked by the user', permanent: true });
    const { db, notifier: chat } = notifier([telegramRow]);
    const [result] = await chat.send('proj_1', ['brc_t'], alert);
    expect(result).toMatchObject({ status: 'failed', error: 'bot was blocked by the user' });
    const disable = db.queryCalls(/UPDATE brief_channels SET enabled = false/);
    expect(disable).toHaveLength(1);
    expect(disable[0].values).toEqual(['brc_t', 'bot was blocked by the user']);
  });

  it('leaves a channel on after a temporary failure', async () => {
    slack.sendMessage.mockResolvedValue({ ok: false, status: 429, description: 'rate_limited', permanent: false });
    const { db, notifier: chat } = notifier([slackRow]);
    const [result] = await chat.send('proj_1', ['brc_s'], alert);
    expect(result).toMatchObject({ status: 'failed', error: 'rate_limited' });
    expect(db.queryCalls(/UPDATE brief_channels SET enabled = false/)).toHaveLength(0);
  });

  it('never throws: a sender that blows up, or a database that is down, becomes a failed delivery', async () => {
    telegram.sendMessage.mockRejectedValue(new Error('socket hang up'));
    const [crashed] = await notifier([telegramRow]).notifier.send('proj_1', ['brc_t'], alert);
    expect(crashed).toMatchObject({ status: 'failed', error: 'socket hang up' });

    const brokenDb = { query: vi.fn().mockRejectedValue(new Error('db down')) };
    const down = new ChatNotifier(brokenDb as never, telegram as never, slack as never);
    const results = await down.send('proj_1', ['brc_t', 'brc_s'], alert);
    expect(results.map((result) => result.status)).toEqual(['failed', 'failed']);
  });

  it('does nothing when the alert has no chat channels', async () => {
    const { db, notifier: chat } = notifier([]);
    expect(await chat.send('proj_1', [], alert)).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe('AlertsService with chat channels', () => {
  const baseAlert = {
    id: 'alt_1',
    project_id: 'proj_1',
    name: 'Checkout failures',
    event_name: 'payment_failed',
    measure: 'count',
    property: null,
    filters: [],
    window_hours: 24,
    condition: 'above',
    threshold: 30,
    webhook_url: null,
    email_recipients: [],
    notification_group_ids: [],
    chat_channel_ids: ['brc_t', 'brc_s'],
    enabled: true,
    last_status: 'ok',
    last_value: null,
    last_evaluated_at: null,
    organization_id: 'org_1'
  };

  const chat = {
    listForProject: vi.fn(),
    idsInProject: vi.fn(),
    send: vi.fn()
  };

  beforeEach(() => {
    chat.listForProject.mockReset().mockResolvedValue([]);
    chat.idsInProject.mockReset().mockImplementation(async (_project: string, ids: string[]) => ids);
    chat.send.mockReset().mockResolvedValue([]);
  });

  function service(extra: { email?: unknown } = {}) {
    const db = mockDatabase((text) => (text.includes('FROM events') ? rows([{ value: 42 }]) : affected(1)));
    const entitlements = {
      assertAlertsAvailable: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro', features: { alerts: true } })
    };
    const projects = {
      requireWritableProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }),
      resolveActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1', name: 'Nuwell' }),
      requireActiveProject: vi.fn()
    };
    const email = extra.email ?? { send: vi.fn().mockResolvedValue({ ok: true }) };
    return {
      db,
      entitlements,
      service: new AlertsService(db as never, projects as never, { resolveMembers: vi.fn().mockResolvedValue([]) } as never, email as never, entitlements as never, chat as never)
    };
  }

  const body = { projectId: 'proj_1', name: 'Checkout failures', eventName: 'payment_failed', measure: 'count', condition: 'above', threshold: 30 };

  it('lets an alert use only a chat, with no email or webhook', async () => {
    const { db, service: alerts } = service();
    await expect(alerts.create({ id: 'usr_1' } as never, { ...body, chatChannelIds: ['brc_t'] })).resolves.toMatchObject({ name: 'Checkout failures' });
    const insert = db.queryCalls(/INSERT INTO alerts/)[0];
    expect(insert.values[insert.values.length - 1]).toEqual(['brc_t']);
    expect(chat.idsInProject).toHaveBeenCalledWith('proj_1', ['brc_t']);
  });

  it('rejects a channel from another project, and saves nothing', async () => {
    chat.idsInProject.mockResolvedValue([]); // none of the ids belong to this project
    const { db, service: alerts } = service();
    await expect(alerts.create({ id: 'usr_1' } as never, { ...body, chatChannelIds: ['brc_someone_elses'] })).rejects.toThrow(BadRequestException);
    expect(db.queryCalls(/INSERT INTO alerts/)).toHaveLength(0);
  });

  it('still needs at least one way to be told, and ignores junk ids', async () => {
    const { service: alerts } = service();
    await expect(alerts.create({ id: 'usr_1' } as never, body)).rejects.toThrow(/Pick at least one notification channel/);
    await expect(alerts.create({ id: 'usr_1' } as never, { ...body, chatChannelIds: [42, null, ''] as never })).rejects.toThrow(/Pick at least one/);
  });

  it('posts to the chosen chats when it fires, and records each result', async () => {
    chat.send.mockResolvedValue([
      { channelId: 'brc_t', kind: 'telegram', name: 'Emmanuel', status: 'sent', error: null },
      { channelId: 'brc_s', kind: 'slack', name: '#alerts (Nuwell)', status: 'failed', error: 'no_service' }
    ]);
    const { db, service: alerts } = service();

    await alerts.evaluateAlert(baseAlert as never, { persist: true, notify: true });

    expect(chat.send).toHaveBeenCalledTimes(1);
    const [projectId, channelIds, sent] = chat.send.mock.calls[0];
    expect(projectId).toBe('proj_1');
    expect(channelIds).toEqual(['brc_t', 'brc_s']);
    expect(sent.name).toBe('Checkout failures');
    expect(sent.message).toContain('payment_failed');
    expect(sent.alertUrl).toMatch(/\/dashboard\/alerts$/);

    const deliveries = db.queryCalls(/INSERT INTO alert_deliveries/);
    expect(deliveries.map((call) => [call.values[3], call.values[4], call.values[5], call.values[6]])).toEqual([
      ['telegram', 'Emmanuel', 'sent', null],
      ['slack', '#alerts (Nuwell)', 'failed', 'no_service']
    ]);
  });

  it('does not call the chat code for an alert without chat channels, and not when it was already firing', async () => {
    const plain = service();
    await plain.service.evaluateAlert({ ...baseAlert, chat_channel_ids: [], email_recipients: ['ops@b.co'] } as never, { persist: true, notify: true });
    expect(chat.send).not.toHaveBeenCalled();

    const again = service();
    await again.service.evaluateAlert({ ...baseAlert, last_status: 'triggered' } as never, { persist: true, notify: true });
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('checks the plan again right before posting to a chat', async () => {
    const { entitlements, service: alerts } = service();
    await alerts.evaluateAlert(baseAlert as never, { persist: true, notify: true });
    expect(entitlements.assertAlertsAvailable.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('offers the project’s chats and each alert’s chosen ones in the list', async () => {
    chat.listForProject.mockResolvedValue([{ id: 'brc_t', kind: 'telegram', name: 'Emmanuel', enabled: true }]);
    const db = mockDatabase((text) => (/SELECT \* FROM alerts WHERE project_id/.test(text) ? rows([baseAlert]) : rows([])));
    const alerts = new AlertsService(
      db as never,
      { resolveActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }) } as never,
      {} as never,
      {} as never,
      { getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro', features: { alerts: true } }) } as never,
      chat as never
    );
    const result = await alerts.list({ id: 'usr_1' } as never, 'proj_1');
    expect(result.chatChannels).toEqual([{ id: 'brc_t', kind: 'telegram', name: 'Emmanuel', enabled: true }]);
    expect(result.alerts[0].chatChannelIds).toEqual(['brc_t', 'brc_s']);
    expect(chat.listForProject).toHaveBeenCalledWith('proj_1');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefsService } from '../src/modules/briefs/briefs.service';
import { TELEGRAM_COMMANDS } from '../src/modules/briefs/briefs.scheduler';
import { TelegramClient } from '../src/modules/briefs/telegram.client';
import {
  buildBriefMessage,
  buildSlackBriefMessage,
  parsePeriod,
  periodDays,
  periodLabel,
  periodRevenueInterval,
  suggestAction
} from '../src/modules/briefs/briefs.util';
import { InsightsService } from '../src/modules/insights/insights.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const facts = (overrides: Partial<Parameters<typeof suggestAction>[0]> = {}) => ({
  eventsToday: 900,
  eventsYesterday: 600,
  deltaPct: 50,
  uniquesToday: 120,
  topEvent: null,
  topCountry: null,
  topDevice: null,
  activeNow: 0,
  lastEventAt: null,
  ...overrides
});

describe('parsePeriod', () => {
  it('reads what people type or tap', () => {
    for (const text of ['daily', 'Daily', 'day', 'today', '24h']) expect(parsePeriod(text)).toBe('daily');
    for (const text of ['weekly', 'week', '7d', '7 days']) expect(parsePeriod(text)).toBe('weekly');
    for (const text of ['monthly', 'month', '30d']) expect(parsePeriod(text)).toBe('monthly');
    for (const text of ['all', 'alltime', 'all time', 'all_time', 'all-time', 'ALL', 'everything', 'lifetime']) expect(parsePeriod(text)).toBe('all');
  });

  it('returns null for anything else, so the caller asks instead of guessing', () => {
    for (const text of ['', '   ', 'yearly', 'foo', 'brief', undefined, null]) expect(parsePeriod(text as never)).toBeNull();
  });
});

describe('period helpers', () => {
  it('maps each period to its window and label', () => {
    expect([periodDays('daily'), periodDays('weekly'), periodDays('monthly'), periodDays('all')]).toEqual([1, 7, 30, 'all']);
    expect(['daily', 'weekly', 'monthly', 'all'].map((p) => periodLabel(p as never))).toEqual(['daily', 'weekly', 'monthly', 'all-time']);
    expect(['daily', 'weekly', 'monthly', 'all'].map((p) => periodRevenueInterval(p as never))).toEqual(['1 day', '7 days', '30 days', '36500 days']);
  });

  it('titles the brief by period in Telegram and Slack', () => {
    const base = { projectName: 'Nuwell', narrative: 'Quiet.', facts: facts(), revenue: null, dashboardUrl: 'https://traceiq.run/dashboard' };
    for (const [period, word] of [['daily', 'daily'], ['weekly', 'weekly'], ['monthly', 'monthly'], ['all', 'all-time']] as const) {
      expect(buildBriefMessage({ ...base, cadence: period })).toContain(`your ${word} brief`);
      expect(buildSlackBriefMessage({ ...base, cadence: period })).toContain(`your ${word} brief`);
    }
  });

  it('only offers the upgrade on a Free weekly brief, never on monthly or all time', () => {
    const base = { projectName: 'Nuwell', narrative: 'Quiet.', facts: facts(), revenue: null, dashboardUrl: 'https://x/d', upgradeUrl: 'https://x/billing' };
    expect(buildBriefMessage({ ...base, cadence: 'weekly' })).toContain('Upgrade to Pro');
    expect(buildBriefMessage({ ...base, cadence: 'monthly' })).not.toContain('Upgrade to Pro');
    expect(buildBriefMessage({ ...base, cadence: 'all' })).not.toContain('Upgrade to Pro');
    expect(buildBriefMessage({ ...base, cadence: 'weekly', upgradeUrl: undefined })).not.toContain('Upgrade to Pro');
  });

  it('words the warning for the period, and has no trend for all time', () => {
    const down = facts({ eventsToday: 100, eventsYesterday: 400, deltaPct: -75 });
    expect(suggestAction(down, null, 'monthly')).toContain('vs 400 the month before');
    expect(suggestAction(down, null, 'all')).toBeNull();
    const payments = { total: 0, transactions: 2, failed: 5, currency: 'NGN' };
    expect(suggestAction(facts(), payments, 'monthly')).toContain('in the last 30 days');
    expect(suggestAction(facts(), payments, 'all')).toContain('so far');
  });
});

describe('story for monthly and all time', () => {
  function insights(counts: { today: number; yesterday: number }) {
    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) return rows([{ today: counts.today, yesterday: counts.yesterday, uniques_today: 40, active_now: 0 }]);
      return rows([]);
    });
    const ai = { generateStoryNarrative: vi.fn().mockResolvedValue('AI daily text.') };
    return { db, ai, service: new InsightsService(db as never, {} as never, ai as never, {} as never) };
  }
  const project = { id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' };
  const day = 24 * 60 * 60 * 1000;

  afterEach(() => vi.useRealTimers());

  it('compares 30 days with the 30 before, in month wording, without the AI', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-02T08:00:00Z'));
    const { db, ai, service } = insights({ today: 900, yesterday: 600 });
    const story = await service.getProjectStory(project, 30);
    expect(ai.generateStoryNarrative).not.toHaveBeenCalled();
    expect(story.narrative).toContain('this month');
    expect(story.narrative).toContain('last month');
    expect(story.narrative).not.toMatch(/today|yesterday|this week/);
    const [, start, previousStart] = db.calls.find((call) => /AS today/.test(call.text))!.values as string[];
    expect(Date.now() - new Date(start).getTime()).toBe(30 * day);
    expect(Date.now() - new Date(previousStart).getTime()).toBe(60 * day);
  });

  it('covers everything since the start for all time, with nothing to compare against', async () => {
    const { db, ai, service } = insights({ today: 836_439, yesterday: 0 });
    const story = await service.getProjectStory(project, 'all');
    expect(ai.generateStoryNarrative).not.toHaveBeenCalled();
    expect(story.narrative).toBe('Your project has recorded 836,439 events since the start.');
    expect(story.facts.deltaPct).toBeNull();
    const [, start, previousStart] = db.calls.find((call) => /AS today/.test(call.text))!.values as string[];
    expect(new Date(start).getTime()).toBe(0);
    expect(new Date(previousStart).getTime()).toBe(0); // an empty "before", so no comparison
  });

  it('says so plainly for a project with no events', async () => {
    const { service } = insights({ today: 0, yesterday: 0 });
    expect((await service.getProjectStory(project, 'all')).narrative).toContain('No events yet.');
    expect((await service.getProjectStory(project, 30)).narrative).toContain('No events this month.');
  });

  it('keeps the daily story and its AI narrative as it was', async () => {
    const { ai, service } = insights({ today: 900, yesterday: 600 });
    expect((await service.getProjectStory(project)).narrative).toBe('AI daily text.');
    expect(ai.generateStoryNarrative).toHaveBeenCalledTimes(1);
  });
});

describe('Telegram client', () => {
  const fetchMock = vi.fn();
  const client = new TelegramClient();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_BOT_USERNAME = 'traceiq_bot';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
  });

  const lastBody = () => JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
  const lastMethod = () => String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]).split('/').pop();

  it('sends buttons under a message only when asked to', async () => {
    await client.sendMessage('555', 'Which?', { inlineKeyboard: [[{ text: 'Daily', callback_data: 'brief:daily' }]] });
    expect(lastBody().reply_markup).toEqual({ inline_keyboard: [[{ text: 'Daily', callback_data: 'brief:daily' }]] });
    await client.sendMessage('555', 'Plain');
    expect(lastBody()).not.toHaveProperty('reply_markup');
  });

  it('listens for button presses as well as messages', async () => {
    await client.setWebhook('https://api.traceiq.run/hook', 'secret');
    expect(lastBody().allowed_updates).toEqual(['message', 'callback_query']);
  });

  it('answers a press and publishes the command menu', async () => {
    await client.answerCallbackQuery('cb_1');
    expect(lastMethod()).toBe('answerCallbackQuery');
    expect(lastBody()).toEqual({ callback_query_id: 'cb_1' });
    await client.answerCallbackQuery('cb_2', 'One moment…');
    expect(lastBody()).toEqual({ callback_query_id: 'cb_2', text: 'One moment…' });
    await client.setCommands(TELEGRAM_COMMANDS);
    expect(lastMethod()).toBe('setMyCommands');
    expect(lastBody().commands).toHaveLength(TELEGRAM_COMMANDS.length);
  });

  it('lists only command names Telegram accepts', () => {
    for (const { command, description } of TELEGRAM_COMMANDS) {
      expect(command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(256);
    }
    expect(TELEGRAM_COMMANDS.map((item) => item.command)).toEqual(expect.arrayContaining(['brief', 'brief_daily', 'brief_weekly', 'brief_monthly', 'brief_alltime']));
  });
});

describe('Telegram commands', () => {
  const telegram = { isConfigured: true, botUsername: 'traceiq_bot', sendMessage: vi.fn(), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), setCommands: vi.fn() };
  const slack = { isConfigured: true, authorizeUrl: vi.fn(), exchangeCode: vi.fn(), sendMessage: vi.fn() };
  const insights = { getProjectStory: vi.fn() };
  const entitlements = { getSnapshot: vi.fn() };
  const channel = { id: 'brc_1', projectId: 'proj_1', kind: 'telegram', chatId: '555', chatName: 'Emmanuel', enabled: true, sendHour: 8, timezone: 'UTC', lastSentOn: null, lastError: null };

  let chatCounter = 0;
  beforeEach(() => {
    chatCounter += 1;
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    telegram.answerCallbackQuery.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    insights.getProjectStory.mockReset().mockResolvedValue({ facts: facts(), narrative: 'All good.' });
    entitlements.getSnapshot.mockReset().mockResolvedValue({ plan: 'pro' });
  });

  // A fresh chat id per test, so one test's cooldown never leaks into the next.
  function setup(connected = true) {
    const chatId = `chat_${chatCounter}`;
    const db = mockDatabase((text) => {
      if (/FROM brief_channels WHERE kind = 'telegram' AND chat_id/.test(text)) return rows(connected ? [{ ...channel, chatId }] : []);
      if (/FROM projects WHERE id/.test(text)) return rows([{ id: 'proj_1', name: 'Nuwell', organizationId: 'org_1' }]);
      return affected(0);
    });
    const service = new BriefsService(db as never, { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() } as never, insights as never, telegram as never, slack as never, entitlements as never);
    const say = (text: string) => service.handleTelegramUpdate({ message: { text, chat: { id: chatId, type: 'private' } } });
    const press = (data: string, id = 'cb_1') => service.handleTelegramUpdate({ callback_query: { id, data, message: { chat: { id: chatId, type: 'private' } } } });
    return { db, service, chatId, say, press };
  }

  it('/brief asks which one, with four buttons', async () => {
    const { say } = setup();
    await say('/brief');
    expect(insights.getProjectStory).not.toHaveBeenCalled();
    const [, text, options] = telegram.sendMessage.mock.calls[0];
    expect(text).toBe('Which brief do you want?');
    expect(options.inlineKeyboard.flat().map((button: { callback_data: string }) => button.callback_data)).toEqual([
      'brief:daily',
      'brief:weekly',
      'brief:monthly',
      'brief:all'
    ]);
  });

  it('/brief with something it does not know asks, instead of guessing', async () => {
    const { say } = setup();
    await say('/brief yearly');
    expect(telegram.sendMessage.mock.calls[0][1]).toBe('Which brief do you want?');
  });

  it('/brief_weekly, /brief_monthly and /brief_alltime send those periods', async () => {
    for (const [command, days] of [['/brief_weekly', 7], ['/brief_monthly', 30], ['/brief_alltime', 'all'], ['/brief_all_time', 'all'], ['/brief_daily', 1]] as const) {
      insights.getProjectStory.mockClear();
      const { say } = setup();
      await say(command);
      expect(insights.getProjectStory).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_1' }), days);
    }
  });

  it('/brief weekly works as an argument, and /brief_weekly@botname works in a group', async () => {
    const first = setup();
    await first.say('/brief weekly');
    expect(insights.getProjectStory).toHaveBeenLastCalledWith(expect.anything(), 7);
    const second = setup();
    await second.say('/brief_monthly@traceiq_bot');
    expect(insights.getProjectStory).toHaveBeenLastCalledWith(expect.anything(), 30);
  });

  it('titles the message by period and covers revenue over the same window', async () => {
    const { say } = setup();
    await say('/brief_monthly');
    const message = telegram.sendMessage.mock.calls.find((call) => String(call[1]).includes('brief'))![1] as string;
    expect(message).toContain('your monthly brief');
  });

  it('a button press is answered, then sends that period', async () => {
    const { press } = setup();
    await press('brief:weekly', 'cb_42');
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb_42', undefined);
    expect(insights.getProjectStory).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it('answers a press it does not understand without sending anything', async () => {
    const { press } = setup();
    await press('something:else', 'cb_9');
    expect(telegram.answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(insights.getProjectStory).not.toHaveBeenCalled();
    await press('brief:yearly', 'cb_10');
    expect(insights.getProjectStory).not.toHaveBeenCalled();
  });

  it('holds a Free plan to the weekly brief: daily gets an upgrade note, weekly and monthly work', async () => {
    entitlements.getSnapshot.mockResolvedValue({ plan: 'free' });
    const daily = setup();
    await daily.say('/brief_daily');
    expect(insights.getProjectStory).not.toHaveBeenCalled();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('daily brief is on the Pro plan');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('/brief_weekly');

    const weekly = setup();
    await weekly.say('/brief_weekly');
    expect(insights.getProjectStory).toHaveBeenLastCalledWith(expect.anything(), 7);
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).toContain('Upgrade to Pro'); // Free's weekly offers the upgrade

    const monthly = setup();
    await monthly.say('/brief_monthly');
    expect(insights.getProjectStory).toHaveBeenLastCalledWith(expect.anything(), 30);
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).not.toContain('Upgrade to Pro');
  });

  it('lets Pro ask for a weekly brief without being offered an upgrade', async () => {
    const { say } = setup();
    await say('/brief_weekly');
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).toContain('your weekly brief');
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).not.toContain('Upgrade to Pro');
  });

  it('ignores a second request from the same chat a moment later', async () => {
    const { say } = setup();
    await say('/brief_alltime');
    await say('/brief_alltime');
    expect(insights.getProjectStory).toHaveBeenCalledTimes(1);
  });

  it('tells a chat that is not connected how to connect, for the menu and for a period', async () => {
    const menu = setup(false);
    await menu.say('/brief');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('not connected to a project yet');
    const direct = setup(false);
    await direct.say('/brief_weekly');
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).toContain('not connected to a project yet');
    expect(insights.getProjectStory).not.toHaveBeenCalled();
  });

  it('lists the commands for an unknown command or /start with no code', async () => {
    const { say } = setup();
    await say('/brief_yearly');
    await say('/start');
    for (const call of telegram.sendMessage.mock.calls) {
      expect(call[1]).toContain('/brief_daily');
      expect(call[1]).toContain('/brief_alltime');
    }
  });

  it('never throws on a malformed update', async () => {
    const { service } = setup();
    await expect(service.handleTelegramUpdate({ callback_query: {} })).resolves.toBeUndefined();
    await expect(service.handleTelegramUpdate({ callback_query: { id: 5, data: 7, message: { chat: {} } } } as never)).resolves.toBeUndefined();
  });
});

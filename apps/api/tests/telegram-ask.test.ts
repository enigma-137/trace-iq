import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefsService } from '../src/modules/briefs/briefs.service';
import { TELEGRAM_COMMANDS } from '../src/modules/briefs/briefs.scheduler';
import { askFailureMessage, clipAnswer, markdownToTelegramHtml } from '../src/modules/briefs/telegram-ask.util';
import { affected, mockDatabase, rows } from './helpers/mock-db';

describe('markdownToTelegramHtml', () => {
  it('converts the Markdown an answer uses into Telegram HTML', () => {
    const html = markdownToTelegramHtml('## Summary\nSignups **fell 12%**.\n- `/checkout` errors\n* a second point', 'https://traceiq.run');
    expect(html).toBe('<b>Summary</b>\nSignups <b>fell 12%</b>.\n• <code>/checkout</code> errors\n• a second point');
  });

  it('escapes anything quoted from customer data, so it cannot inject a tag', () => {
    const html = markdownToTelegramHtml('Error: <script>alert(1)</script> & <b>x</b>', 'https://traceiq.run');
    expect(html).toBe('Error: &lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;');
  });

  it('prefixes relative dashboard links and drops links that are not web links', () => {
    const base = 'https://traceiq.run/';
    expect(markdownToTelegramHtml('[Open errors](/dashboard/errors)', base)).toBe('<a href="https://traceiq.run/dashboard/errors">Open errors</a>');
    expect(markdownToTelegramHtml('[docs](https://example.com/a)', base)).toBe('<a href="https://example.com/a">docs</a>');
    expect(markdownToTelegramHtml('[bad](javascript:alert(1))', base)).not.toContain('<a');
    expect(markdownToTelegramHtml('[quote](https://x.com/a"onclick="y)', base)).toBe('quote');
  });

  it('keeps every opened tag closed', () => {
    const html = markdownToTelegramHtml('**one** and **two** and `a` and `b`', 'https://x');
    expect((html.match(/<b>/g) ?? []).length).toBe((html.match(/<\/b>/g) ?? []).length);
    expect((html.match(/<code>/g) ?? []).length).toBe((html.match(/<\/code>/g) ?? []).length);
  });
});

describe('clipAnswer', () => {
  it('leaves a short answer alone', () => {
    expect(clipAnswer('  short  ')).toEqual({ text: 'short', clipped: false });
  });

  it('cuts a long one at a line break under the limit', () => {
    const long = Array.from({ length: 400 }, (_, i) => `line number ${i}`).join('\n');
    const { text, clipped } = clipAnswer(long);
    expect(clipped).toBe(true);
    expect(text.length).toBeLessThanOrEqual(3300);
    expect(long.startsWith(text)).toBe(true);
    expect(long[text.length]).toBe('\n');
  });
});

describe('askFailureMessage', () => {
  it('names the monthly allowance and offers the upgrade link', () => {
    const error = new ForbiddenException({ code: 'MONTHLY_AI_INSIGHTS_LIMIT_REACHED', message: 'x' });
    const message = askFailureMessage(error, 'https://x/billing');
    expect(message).toContain("this month's Ask TraceIQ allowance");
    expect(message).toContain('https://x/billing');
  });

  it('says plainly when Ask is not set up, when the account lost access, and for anything else', () => {
    expect(askFailureMessage(new ServiceUnavailableException('gateway down'), 'u')).toContain('busy or temporarily unavailable');
    expect(askFailureMessage(new ForbiddenException('nope'), 'u')).toContain('Reconnect');
    expect(askFailureMessage(new Error('boom: secret detail'), 'u')).toBe('Something went wrong while looking into that. Try again in a moment.');
  });
});

describe('asking a question in Telegram', () => {
  const telegram = {
    isConfigured: true,
    botUsername: 'traceiq_bot',
    sendMessage: vi.fn(),
    sendChatAction: vi.fn(),
    answerCallbackQuery: vi.fn(),
    setWebhook: vi.fn(),
    setCommands: vi.fn()
  };
  const ask = { ask: vi.fn() };
  const channel = {
    id: 'brc_1', projectId: 'proj_1', kind: 'telegram', chatId: '555', chatName: 'Emmanuel', enabled: true,
    sendHour: 8, timezone: 'UTC', lastSentOn: null, lastError: null, createdByUserId: 'user_9'
  };

  let counter = 0;
  beforeEach(() => {
    counter += 1;
    telegram.sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    telegram.sendChatAction.mockReset().mockResolvedValue({ ok: true, status: 200, permanent: false });
    ask.ask.mockReset().mockResolvedValue({ conversationId: 'conv_1', answer: '**Signups** are flat.', suggestedFollowups: [] });
  });

  function setup(options: { connected?: boolean; creator?: string | null; withAsk?: boolean } = {}) {
    const { connected = true, creator = 'user_9', withAsk = true } = options;
    const chatId = `ask_chat_${counter}`;
    const db = mockDatabase((text) => {
      if (/FROM brief_channels WHERE kind = 'telegram' AND chat_id/.test(text)) {
        return rows(connected ? [{ ...channel, chatId, createdByUserId: creator }] : []);
      }
      return affected(0);
    });
    const service = new BriefsService(
      db as never,
      { requireWritableProject: vi.fn(), requireActiveProject: vi.fn() } as never,
      {} as never,
      telegram as never,
      { isConfigured: true } as never,
      { getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro' }) } as never,
      withAsk ? (ask as never) : undefined
    );
    const say = async (text: string, type = 'private', updateId?: number) => {
      await service.handleTelegramUpdate({ update_id: updateId, message: { text, chat: { id: chatId, type } } });
      await service.waitForAsks();
    };
    return { service, say, chatId };
  }

  it('answers a plain message in a private chat, as the person who connected it', async () => {
    const { say } = setup();
    await say('why did signups drop?', 'private', 77);
    const [user, request] = ask.ask.mock.calls[0];
    expect(user).toMatchObject({ id: 'user_9', scopes: ['analytics:read'] });
    expect(request).toMatchObject({ question: 'why did signups drop?', projectId: 'proj_1', source: 'telegram' });
    expect(request.idempotencyKey).toMatch(/^telegram:ask_chat_\d+:77$/);
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).toBe('<b>Signups</b> are flat.');
    expect(telegram.sendChatAction).toHaveBeenCalled();
  });

  it('/ask <question> works too, including with the bot name', async () => {
    const { say } = setup();
    await say('/ask@traceiq_bot which errors are new?');
    expect(ask.ask.mock.calls[0][1].question).toBe('which errors are new?');
  });

  it('keeps a follow-up in the same conversation', async () => {
    const { say } = setup();
    await say('first question');
    await say('and the second?');
    expect(ask.ask.mock.calls[0][1].conversationId).toBeUndefined();
    expect(ask.ask.mock.calls[1][1].conversationId).toBe('conv_1');
  });

  it('does not answer in a group: plain talk is ignored, /ask points to a private chat', async () => {
    const { say } = setup();
    await say('hello team', 'group');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    await say('/ask how many users?', 'supergroup');
    expect(ask.ask).not.toHaveBeenCalled();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('private chat');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('@traceiq_bot');
  });

  it('explains what to do with an empty /ask', async () => {
    const { say } = setup();
    await say('/ask');
    expect(ask.ask).not.toHaveBeenCalled();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Ask me anything');
  });

  it('says so when the chat is not connected, and never runs an investigation', async () => {
    const { say } = setup({ connected: false });
    await say('how are we doing?');
    expect(ask.ask).not.toHaveBeenCalled();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('not connected');
  });

  it('asks to reconnect a chat that has no owner on record', async () => {
    const { say } = setup({ creator: null });
    await say('how are we doing?');
    expect(ask.ask).not.toHaveBeenCalled();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Reconnect');
  });

  it('handles a server without Ask', async () => {
    const { say } = setup({ withAsk: false });
    await say('how are we doing?');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain("isn't available");
  });

  it('runs one question at a time per chat', async () => {
    let release: (value: unknown) => void = () => undefined;
    ask.ask.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { service, chatId } = setup();
    await service.handleTelegramUpdate({ message: { text: 'slow one', chat: { id: chatId, type: 'private' } } });
    await service.handleTelegramUpdate({ message: { text: 'impatient follow-up', chat: { id: chatId, type: 'private' } } });
    expect(ask.ask).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('still working');
    release({ conversationId: 'c', answer: 'done', suggestedFollowups: [] });
    await service.waitForAsks();
  });

  it('limits how many questions a chat can send a minute', async () => {
    const { say } = setup();
    for (let i = 0; i < 6; i += 1) await say(`question ${i}`);
    expect(ask.ask).toHaveBeenCalledTimes(6);
    await say('one too many');
    expect(ask.ask).toHaveBeenCalledTimes(6);
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).toContain('Give me a minute');
  });

  it('trims a very long question', async () => {
    const { say } = setup();
    await say('x'.repeat(2000));
    expect(ask.ask.mock.calls[0][1].question).toHaveLength(500);
  });

  it('turns an allowance error into a friendly message with the upgrade link', async () => {
    ask.ask.mockRejectedValueOnce(new ForbiddenException({ code: 'MONTHLY_AI_INSIGHTS_LIMIT_REACHED', message: 'x' }));
    const { say } = setup();
    await say('anything');
    const last = telegram.sendMessage.mock.calls.at(-1)![1] as string;
    expect(last).toContain("this month's Ask TraceIQ allowance");
    expect(last).toContain('/dashboard/settings/billing');
  });

  it('never shows a raw error, and frees the chat for the next question', async () => {
    ask.ask.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5'));
    const { say } = setup();
    await say('first');
    expect(telegram.sendMessage.mock.calls.at(-1)![1]).not.toContain('ECONNREFUSED');
    await say('second');
    expect(ask.ask).toHaveBeenCalledTimes(2);
  });

  it('clips a long answer and links to the dashboard for the rest', async () => {
    ask.ask.mockResolvedValueOnce({ conversationId: 'c', answer: Array.from({ length: 500 }, (_, i) => `finding ${i}`).join('\n'), suggestedFollowups: [] });
    const { say } = setup();
    await say('big question');
    const sent = telegram.sendMessage.mock.calls.at(-1)![1] as string;
    expect(sent.length).toBeLessThan(4096);
    expect(sent).toContain('Open TraceIQ for the full answer');
  });

  it('falls back to plain text when Telegram rejects the formatting', async () => {
    telegram.sendMessage.mockResolvedValueOnce({ ok: false, status: 400, description: "Bad Request: can't parse entities", permanent: true });
    ask.ask.mockResolvedValueOnce({ conversationId: 'c', answer: 'plain <answer>', suggestedFollowups: [] });
    const { say } = setup();
    await say('q');
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(telegram.sendMessage.mock.calls[1][1]).toBe('plain &lt;answer&gt;');
  });

  it('lists /ask in the bot menu', () => {
    expect(TELEGRAM_COMMANDS.map((c) => c.command)).toContain('ask');
  });
});

import { BadRequestException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { AskService } from '../ai/ask/ask.service';
import { EntitlementService } from '../billing/entitlement.service';
import { InsightsService } from '../insights/insights.service';
import { ProjectsService } from '../projects/projects.service';
import { loadRevenueSettings, queryRevenueTotals, revenueActive } from '../revenue/revenue.util';
import {
  DEFAULT_SEND_HOUR,
  DEFAULT_TIMEZONE,
  LINK_CODE_TTL_MS,
  BriefCadence,
  BriefPeriod,
  BriefRevenue,
  BriefInput,
  periodDays,
  periodRevenueInterval,
  parsePeriod,
  buildBriefMessage,
  buildSlackBriefMessage,
  escapeHtml,
  hashLinkCode,
  isBriefDue,
  isQuietDay,
  isValidTimezone,
  localDateAndHour,
  newLinkCode
} from './briefs.util';
import { SlackClient } from './slack.client';
import { MAX_QUESTION_LENGTH, askFailureMessage, clipAnswer, markdownToTelegramHtml } from './telegram-ask.util';
import { TelegramClient, TelegramSendResult } from './telegram.client';

export interface BriefChannel {
  [column: string]: unknown;
  id: string;
  projectId: string;
  kind: 'telegram' | 'slack';
  chatId: string;
  chatName: string | null;
  enabled: boolean;
  sendHour: number;
  timezone: string;
  lastSentOn: string | null;
  lastError: string | null;
  /** Who connected the chat; only selected where a chat's questions need an account to run as. */
  createdByUserId?: string | null;
}

export interface BriefChannelPatch {
  enabled?: unknown;
  sendHour?: unknown;
  timezone?: unknown;
}

interface TelegramUpdate {
  update_id?: unknown;
  message?: {
    text?: unknown;
    chat?: { id?: unknown; type?: unknown; title?: unknown; first_name?: unknown; username?: unknown };
  };
  /** A press on an inline button under one of our messages. */
  callback_query?: {
    id?: unknown;
    data?: unknown;
    message?: { chat?: { id?: unknown; type?: unknown } };
  };
}

/** Minimum gap between on-demand briefs in one chat. All-time and monthly ones read a lot of events. */
const ON_DEMAND_COOLDOWN_MS = 8_000;

/** One question at a time per chat, a few a minute, and a follow-up keeps its thread for half an hour. */
const ASK_MAX_PER_MINUTE = 6;
const ASK_THREAD_TTL_MS = 30 * 60_000;
const ASK_THREAD_MAX_ENTRIES = 500;
const TYPING_REFRESH_MS = 4_500;

const PERIOD_BUTTONS: Array<Array<{ text: string; callback_data: string }>> = [
  [
    { text: 'Daily', callback_data: 'brief:daily' },
    { text: 'Weekly', callback_data: 'brief:weekly' }
  ],
  [
    { text: 'Monthly', callback_data: 'brief:monthly' },
    { text: 'All time', callback_data: 'brief:all' }
  ]
];

const CHANNEL_COLUMNS = `
  id, project_id AS "projectId", kind, chat_id AS "chatId", chat_name AS "chatName", enabled,
  send_hour AS "sendHour", timezone, last_sent_on::text AS "lastSentOn", last_error AS "lastError"`;

const dashboardUrl = () => (process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');

@Injectable()
export class BriefsService {
  private readonly logger = new Logger(BriefsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly insights: InsightsService,
    private readonly telegram: TelegramClient,
    private readonly slack: SlackClient,
    private readonly entitlements: EntitlementService,
    @Optional() private readonly ask?: AskService
  ) {}

  private readonly askBusy = new Set<string>();
  private readonly askRecent = new Map<string, number[]>();
  private readonly askThreads = new Map<string, { conversationId: string; projectId: string; expiresAt: number }>();
  private readonly askTasks = new Set<Promise<void>>();

  /** Resolves when every in-flight Ask has finished. For tests and shutdown. */
  async waitForAsks(): Promise<void> {
    await Promise.all([...this.askTasks]);
  }

  private readonly cadenceCache = new Map<string, { cadence: BriefCadence; expiresAt: number }>();

  /**
   * Daily on Pro (and self-hosted), weekly on Free. When the plan can't be read the brief
   * stays daily: a lookup problem should never quietly downgrade someone who is paying.
   * Cached for ten minutes so the per-minute scheduler doesn't query billing every tick.
   */
  async cadenceFor(projectId: string): Promise<BriefCadence> {
    const cached = this.cadenceCache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) return cached.cadence;
    try {
      const owner = await this.database.query<{ organizationId: string }>(
        `SELECT organization_id AS "organizationId" FROM projects WHERE id = $1`,
        [projectId]
      );
      const organizationId = owner.rows[0]?.organizationId;
      if (!organizationId) return 'daily';
      const snapshot = await this.entitlements.getSnapshot(organizationId);
      const cadence: BriefCadence = snapshot.plan === 'free' ? 'weekly' : 'daily';
      this.cadenceCache.set(projectId, { cadence, expiresAt: Date.now() + 10 * 60_000 });
      return cadence;
    } catch (error) {
      this.logger.warn(`Could not read the plan for ${projectId}, sending daily: ${error instanceof Error ? error.message : 'unknown error'}`);
      return 'daily';
    }
  }

  /** Every destination for a project, with which services this server has set up. */
  async getOverview(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE project_id = $1 ORDER BY created_at`,
      [project.id]
    );
    return {
      project: { id: project.id, name: project.name },
      telegram: {
        configured: this.telegram.isConfigured,
        botUsername: this.telegram.isConfigured ? this.telegram.botUsername : null
      },
      slack: { configured: this.slack.isConfigured },
      // 'weekly' on the Free plan (Mondays, last 7 days); 'daily' on Pro.
      cadence: await this.cadenceFor(project.id),
      channels: channels.rows
    };
  }

  /** The "Add to Slack" link. Slack sends the person back to {@link finishSlackInstall}. */
  async createSlackLink(user: DashboardUser, projectId?: string, timezone?: unknown) {
    if (!this.slack.isConfigured) {
      throw new ServiceUnavailableException('Slack is not set up on this TraceIQ server.');
    }
    const project = await this.projects.requireWritableProject(user, projectId);
    const { code, expiresAt } = await this.storeLinkCode(user.id, project.id, 'slack', timezone);
    return { url: this.slack.authorizeUrl(code), expiresAt };
  }

  /**
   * Slack redirects the browser here after the person picks a channel. Returns the dashboard
   * URL to send them on to. Identity comes from the one-time `state`, not a session: it was
   * made for a signed-in user with write access and can be used once.
   */
  async finishSlackInstall(params: { code?: string; state?: string; error?: string }): Promise<string> {
    const back = (result: string) => `${dashboardUrl()}/dashboard/alerts?tab=brief&slack=${result}`;
    if (params.error) return back('cancelled');
    if (!params.code || !params.state) return back('error');

    const redeemed = await this.redeemStoredCode(params.state, 'slack');
    if (!redeemed) return back('expired');

    const exchanged = await this.slack.exchangeCode(params.code);
    if ('error' in exchanged) {
      this.logger.warn(`Slack install failed: ${exchanged.error}`);
      return back('error');
    }
    const { install } = exchanged;
    const today = localDateAndHour(new Date(), redeemed.timezone).date;
    const chatName = install.teamName ? `#${install.channelName.replace(/^#/, '')} (${install.teamName})` : `#${install.channelName.replace(/^#/, '')}`;

    const saved = await this.database.query<BriefChannel>(
      `INSERT INTO brief_channels (id, project_id, kind, chat_id, chat_name, webhook_url, send_hour, timezone, created_by_user_id, last_sent_on)
       VALUES ($1, $2, 'slack', $3, $4, $5, $6, $7, $8, $9::date)
       ON CONFLICT (project_id, kind, chat_id)
       DO UPDATE SET enabled = true, chat_name = EXCLUDED.chat_name, webhook_url = EXCLUDED.webhook_url, last_error = NULL, updated_at = now()
       RETURNING ${CHANNEL_COLUMNS}`,
      [
        `brc_${randomUUID().replace(/-/g, '')}`,
        redeemed.projectId,
        install.channelId,
        chatName,
        install.webhookUrl,
        DEFAULT_SEND_HOUR,
        redeemed.timezone,
        redeemed.userId,
        today
      ]
    );
    // A first brief right away, so the channel sees what it signed up for.
    await this.sendBrief(saved.rows[0], { force: true });
    return back('connected');
  }

  async getTelegram(user: DashboardUser, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE project_id = $1 AND kind = 'telegram' ORDER BY created_at`,
      [project.id]
    );
    return {
      project: { id: project.id, name: project.name },
      configured: this.telegram.isConfigured,
      botUsername: this.telegram.isConfigured ? this.telegram.botUsername : null,
      channels: channels.rows
    };
  }

  /** A one-time link that opens the bot with a code tying the chat to this project. */
  async createTelegramLink(user: DashboardUser, projectId?: string, timezone?: unknown) {
    if (!this.telegram.isConfigured) {
      throw new ServiceUnavailableException('The Telegram bot is not set up on this TraceIQ server.');
    }
    const project = await this.projects.requireWritableProject(user, projectId);
    const { code, expiresAt } = await this.storeLinkCode(user.id, project.id, 'telegram', timezone);

    const bot = this.telegram.botUsername;
    return {
      url: `https://t.me/${bot}?start=${code}`,
      groupUrl: `https://t.me/${bot}?startgroup=${code}`,
      expiresAt
    };
  }

  /** Stores a one-time code (only its hash) that ties a chat or Slack install to this user and project. */
  private async storeLinkCode(userId: string, projectId: string, kind: 'telegram' | 'slack', timezone: unknown) {
    const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
    const { code, hash } = newLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();

    // One open link per person, project and service; expired ones are swept here.
    await this.database.query(
      `DELETE FROM brief_link_codes WHERE expires_at < now() OR (project_id = $1 AND user_id = $2 AND kind = $3)`,
      [projectId, userId, kind]
    );
    await this.database.query(
      `INSERT INTO brief_link_codes (code_hash, project_id, user_id, kind, timezone, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [hash, projectId, userId, kind, zone, expiresAt]
    );
    return { code, expiresAt };
  }

  /** Uses up a code. Null when it is unknown, already used, expired, or made for the other service. */
  private async redeemStoredCode(code: string, kind: 'telegram' | 'slack') {
    const redeemed = await this.database.query<{ projectId: string; userId: string; timezone: string; expiresAt: string }>(
      `DELETE FROM brief_link_codes WHERE code_hash = $1 AND kind = $2
       RETURNING project_id AS "projectId", user_id AS "userId", timezone, expires_at AS "expiresAt"`,
      [hashLinkCode(code), kind]
    );
    const link = redeemed.rows[0];
    return link && new Date(link.expiresAt).getTime() >= Date.now() ? link : null;
  }

  async updateChannel(user: DashboardUser, channelId: string, patch: BriefChannelPatch) {
    const channel = await this.requireChannel(channelId);
    await this.projects.requireWritableProject(user, channel.projectId);

    const next = { enabled: channel.enabled, sendHour: channel.sendHour, timezone: channel.timezone };
    if (patch.enabled !== undefined) {
      if (typeof patch.enabled !== 'boolean') throw new BadRequestException('enabled must be true or false.');
      next.enabled = patch.enabled;
    }
    if (patch.sendHour !== undefined) {
      if (typeof patch.sendHour !== 'number' || !Number.isInteger(patch.sendHour) || patch.sendHour < 0 || patch.sendHour > 23) {
        throw new BadRequestException('Send hour must be a whole number from 0 to 23.');
      }
      next.sendHour = patch.sendHour;
    }
    if (patch.timezone !== undefined) {
      if (!isValidTimezone(patch.timezone)) throw new BadRequestException('Unknown timezone.');
      next.timezone = patch.timezone;
    }

    // Changing the hour or zone re-opens today, so moving the brief later still sends it today.
    const reopen = next.sendHour !== channel.sendHour || next.timezone !== channel.timezone;
    const updated = await this.database.query<BriefChannel>(
      `UPDATE brief_channels
       SET enabled = $2, send_hour = $3, timezone = $4, last_error = NULL,
           last_sent_on = CASE WHEN $5 THEN NULL ELSE last_sent_on END, updated_at = now()
       WHERE id = $1
       RETURNING ${CHANNEL_COLUMNS}`,
      [channel.id, next.enabled, next.sendHour, next.timezone, reopen]
    );
    return updated.rows[0];
  }

  async deleteChannel(user: DashboardUser, channelId: string) {
    const channel = await this.requireChannel(channelId);
    await this.projects.requireWritableProject(user, channel.projectId);
    await this.database.query(`DELETE FROM brief_channels WHERE id = $1`, [channel.id]);
    return { deleted: true };
  }

  /** "Send now" from the dashboard: sends even on a quiet day so the button always shows something. */
  async sendTest(user: DashboardUser, channelId: string) {
    const channel = await this.requireChannel(channelId);
    await this.projects.requireWritableProject(user, channel.projectId);
    const result = await this.sendBrief(channel, { force: true });
    if (result !== 'quiet' && !result.ok) {
      throw new BadRequestException(result.description ?? `${channel.kind === 'slack' ? 'Slack' : 'Telegram'} did not accept the message.`);
    }
    return { sent: true };
  }

  /** Handles one update posted by Telegram to the webhook. Never throws: Telegram retries on errors. */
  async handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update?.callback_query) {
        await this.handleButtonPress(update.callback_query);
        return;
      }
      const chat = update?.message?.chat;
      const text = update?.message?.text;
      if (!chat || typeof text !== 'string') return;
      if (chat.type !== 'private' && chat.type !== 'group' && chat.type !== 'supergroup') return;

      const chatId = String(chat.id);
      const chatName =
        typeof chat.title === 'string'
          ? chat.title
          : typeof chat.username === 'string'
            ? `@${chat.username}`
            : typeof chat.first_name === 'string'
              ? chat.first_name
              : null;

      const trimmed = text.trim();
      const asked = /^\/ask(?:@\w+)?(?:\s+([\s\S]+))?$/i.exec(trimmed);
      if (asked) {
        await this.startAsk(chatId, chat.type, asked[1] ?? '', update.update_id);
        return;
      }
      // In a private chat any plain message is a question. In a group it is just talk.
      if (!trimmed.startsWith('/')) {
        if (chat.type === 'private' && trimmed) await this.startAsk(chatId, 'private', trimmed, update.update_id);
        return;
      }

      const command = /^\/(\w+)(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(trimmed);
      if (!command) return;
      const [, name, argument] = command;

      switch (name.toLowerCase()) {
        case 'start':
          if (argument) await this.redeemLink(chatId, chatName, argument);
          else await this.telegram.sendMessage(chatId, this.helpText());
          return;
        case 'brief': {
          // "/brief weekly" works too; with nothing, or something we don't know, ask which one.
          const period = parsePeriod(argument);
          if (period) await this.briefForChat(chatId, period);
          else await this.askWhichBrief(chatId);
          return;
        }
        case 'stop':
          await this.stopChat(chatId);
          return;
        default: {
          // /brief_daily, /brief_weekly, /brief_monthly, /brief_alltime (also /brief_all_time).
          const period = name.toLowerCase().startsWith('brief_') ? parsePeriod(name.slice('brief_'.length)) : null;
          if (period) await this.briefForChat(chatId, period);
          else await this.telegram.sendMessage(chatId, this.helpText());
        }
      }
    } catch (error) {
      this.logger.error(`Telegram update failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /** Called every minute: sends the brief to every channel whose local send time has come. */
  async sendDueBriefs(now = new Date()): Promise<number> {
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE enabled AND kind IN ('telegram', 'slack')`
    );

    let sent = 0;
    for (const channel of channels.rows) {
      // Telegram needs the bot token on this server; a Slack channel carries its own webhook.
      if (channel.kind === 'telegram' && !this.telegram.isConfigured) continue;
      // Cheap check first (hour reached, not sent today); only then look up the plan.
      if (!isBriefDue(channel, now).due) continue;
      const cadence = await this.cadenceFor(channel.projectId);
      const { due, localDate } = isBriefDue(channel, now, cadence);
      if (!due) continue;

      // Claim the day first, so a second replica (or a slow send) can't send it twice.
      const claim = await this.database.query(
        `UPDATE brief_channels SET last_sent_on = $2::date, updated_at = now()
         WHERE id = $1 AND enabled AND (last_sent_on IS NULL OR last_sent_on < $2::date)`,
        [channel.id, localDate]
      );
      if (!claim.rowCount) continue;

      const result = await this.sendBrief(channel, { force: false });
      if (result === 'quiet') continue;
      if (result.ok) {
        sent += 1;
        continue;
      }
      await this.recordFailure(channel, localDate, result);
    }
    return sent;
  }

  private async requireChannel(channelId: string): Promise<BriefChannel> {
    const result = await this.database.query<BriefChannel>(`SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE id = $1`, [channelId]);
    if (!result.rows[0]) throw new NotFoundException('Channel not found.');
    return result.rows[0];
  }

  private async redeemLink(chatId: string, chatName: string | null, code: string) {
    const link = await this.redeemStoredCode(code, 'telegram');
    if (!link) {
      await this.telegram.sendMessage(
        chatId,
        'That link has expired or was already used. In TraceIQ, open Alerts → Daily brief and connect Telegram again.'
      );
      return;
    }

    const project = await this.database.query<{ name: string }>(`SELECT name FROM projects WHERE id = $1`, [link.projectId]);
    const projectName = project.rows[0]?.name ?? 'your project';
    const today = localDateAndHour(new Date(), link.timezone).date;

    const saved = await this.database.query<BriefChannel>(
      `INSERT INTO brief_channels (id, project_id, kind, chat_id, chat_name, send_hour, timezone, created_by_user_id, last_sent_on)
       VALUES ($1, $2, 'telegram', $3, $4, $5, $6, $7, $8::date)
       ON CONFLICT (project_id, kind, chat_id)
       DO UPDATE SET enabled = true, chat_name = EXCLUDED.chat_name, last_error = NULL, updated_at = now()
       RETURNING ${CHANNEL_COLUMNS}`,
      [`brc_${randomUUID().replace(/-/g, '')}`, link.projectId, chatId, chatName, DEFAULT_SEND_HOUR, link.timezone, link.userId, today]
    );
    const channel = saved.rows[0];

    const weekly = (await this.cadenceFor(link.projectId)) === 'weekly';
    const when = `${weekly ? 'every Monday' : 'every day'} at ${String(channel.sendHour).padStart(2, '0')}:00 (${escapeHtml(channel.timezone)})`;
    await this.telegram.sendMessage(
      chatId,
      `Connected to <b>${escapeHtml(projectName)}</b>. You'll get a short ${weekly ? 'weekly ' : ''}brief here ${when}.${weekly ? ' The Free plan sends it weekly; Pro sends it every day.' : ''} Change the time in TraceIQ → Alerts → Daily brief.\n\nSend /brief any time and choose daily, weekly, monthly or all time. /stop pauses the scheduled brief.`
    );
    // A first brief right away, so the person sees what they signed up for.
    await this.sendBrief(channel, { force: true });
  }

  private readonly lastOnDemand = new Map<string, number>();

  /** The project's connected Telegram channels for a chat, or null (after saying so) when there are none. */
  private async channelsForChat(chatId: string): Promise<BriefChannel[] | null> {
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS}, created_by_user_id AS "createdByUserId" FROM brief_channels WHERE kind = 'telegram' AND chat_id = $1 AND enabled ORDER BY created_at DESC`,
      [chatId]
    );
    if (channels.rows.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        'This chat is not connected to a project yet. In TraceIQ, open Alerts → Daily brief to connect it.'
      );
      return null;
    }
    return channels.rows;
  }

  /** "/brief" with no period: ask which one, with buttons. */
  private async askWhichBrief(chatId: string) {
    if ((await this.channelsForChat(chatId)) === null) return;
    await this.telegram.sendMessage(chatId, 'Which brief do you want?', { inlineKeyboard: PERIOD_BUTTONS });
  }

  /** True when this chat asked for a brief a moment ago. Stops a chat from hammering the heavier reports. */
  private onCooldown(chatId: string): boolean {
    const now = Date.now();
    const last = this.lastOnDemand.get(chatId);
    if (last !== undefined && now - last < ON_DEMAND_COOLDOWN_MS) return true;
    this.lastOnDemand.set(chatId, now);
    // Keep the map small: forget chats that have been quiet for a minute.
    if (this.lastOnDemand.size > 500) {
      for (const [id, at] of this.lastOnDemand) if (now - at > 60_000) this.lastOnDemand.delete(id);
    }
    return false;
  }

  private async briefForChat(chatId: string, period: BriefPeriod) {
    const channels = await this.channelsForChat(chatId);
    if (channels === null) return;
    if (this.onCooldown(chatId)) return;
    for (const channel of channels) {
      // The Free plan's schedule is weekly, so a daily brief is a Pro feature. The rest are open.
      if (period === 'daily' && (await this.cadenceFor(channel.projectId)) === 'weekly') {
        await this.telegram.sendMessage(
          chatId,
          `The daily brief is on the Pro plan. Your plan includes the weekly brief: send /brief_weekly, or <a href="${escapeHtml(`${dashboardUrl()}/dashboard/settings/billing`)}">upgrade to Pro</a> for daily.`
        );
        continue;
      }
      await this.sendBrief(channel, { force: true, period });
    }
  }

  /** A tap on one of the period buttons. Always answered, so the button stops spinning. */
  private async handleButtonPress(query: NonNullable<TelegramUpdate['callback_query']>) {
    const id = typeof query.id === 'string' ? query.id : '';
    const chatId = query.message?.chat?.id !== undefined ? String(query.message.chat.id) : null;
    const match = typeof query.data === 'string' ? /^brief:(\w+)$/.exec(query.data) : null;
    const period = match ? parsePeriod(match[1]) : null;
    if (id) await this.telegram.answerCallbackQuery(id, period && !this.willSendNow(chatId) ? 'One moment…' : undefined);
    if (!chatId || !period) return;
    await this.briefForChat(chatId, period);
  }

  /** Whether a brief for this chat would go out right now (not held back by the cooldown). */
  private willSendNow(chatId: string | null): boolean {
    if (!chatId) return false;
    const last = this.lastOnDemand.get(chatId);
    return last === undefined || Date.now() - last >= ON_DEMAND_COOLDOWN_MS;
  }

  private async stopChat(chatId: string) {
    await this.database.query(`UPDATE brief_channels SET enabled = false, updated_at = now() WHERE kind = 'telegram' AND chat_id = $1`, [chatId]);
    await this.telegram.sendMessage(chatId, 'Daily briefs paused. Open TraceIQ → Alerts → Daily brief to turn them back on.');
  }

  /**
   * Checks a question can be asked in this chat, then runs it in the background: an
   * investigation takes a while and Telegram re-sends an update that is not answered quickly.
   */
  private async startAsk(chatId: string, chatType: unknown, rawQuestion: string, updateId: unknown) {
    if (chatType !== 'private') {
      const bot = this.telegram.botUsername;
      await this.telegram.sendMessage(
        chatId,
        `Questions work in a private chat with me, so answers about your project stay out of the group.${bot ? ` Message @${escapeHtml(bot)} directly.` : ''}`
      );
      return;
    }

    const question = rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) {
      await this.telegram.sendMessage(
        chatId,
        'Ask me anything about your project, like <i>why did signups drop this week?</i> or <i>which errors are new today?</i> Just type it here.'
      );
      return;
    }

    const channels = await this.channelsForChat(chatId);
    if (channels === null) return;
    if (!this.ask) {
      await this.telegram.sendMessage(chatId, "Ask TraceIQ isn't available on this server right now.");
      return;
    }
    const channel = channels[0];
    if (!channel.createdByUserId) {
      await this.telegram.sendMessage(chatId, 'Reconnect this chat from TraceIQ → Alerts → Daily brief so I know whose project to read.');
      return;
    }

    if (this.askBusy.has(chatId)) {
      await this.telegram.sendMessage(chatId, "I'm still working on your last question. One moment.");
      return;
    }
    const now = Date.now();
    const recent = (this.askRecent.get(chatId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= ASK_MAX_PER_MINUTE) {
      await this.telegram.sendMessage(chatId, "That's a lot of questions at once. Give me a minute.");
      return;
    }
    this.askRecent.set(chatId, [...recent, now]);

    this.askBusy.add(chatId);
    const task: Promise<void> = this.runAsk(chatId, channel, question, updateId).finally(() => {
      this.askBusy.delete(chatId);
      this.askTasks.delete(task);
    });
    this.askTasks.add(task);
  }

  private async runAsk(chatId: string, channel: BriefChannel, question: string, updateId: unknown): Promise<void> {
    const typing = setInterval(() => void this.telegram.sendChatAction(chatId), TYPING_REFRESH_MS);
    void this.telegram.sendChatAction(chatId);
    try {
      const now = Date.now();
      const thread = this.askThreads.get(chatId);
      const conversationId = thread && thread.expiresAt > now && thread.projectId === channel.projectId ? thread.conversationId : undefined;

      const user = { id: channel.createdByUserId as string, authMethod: 'local' as const, scopes: ['analytics:read'] };
      const key = typeof updateId === 'number' ? `telegram:${chatId}:${updateId}` : undefined;
      const request = { question, projectId: channel.projectId, conversationId, source: 'telegram' };
      const answer = await this.ask!.ask(user, { ...request, idempotencyKey: key });

      this.rememberThread(chatId, channel.projectId, answer.conversationId);

      const { text, clipped } = clipAnswer(answer.answer || 'I could not find anything to report on that.');
      const html =
        markdownToTelegramHtml(text, dashboardUrl()) +
        (clipped ? `\n\n<a href="${dashboardUrl()}/dashboard">Open TraceIQ for the full answer</a>` : '');
      const sent = await this.telegram.sendMessage(chatId, html);
      // Telegram refuses markup it cannot parse; fall back to plain text rather than saying nothing.
      if (!sent.ok && /parse|entities/i.test(sent.description ?? '')) await this.telegram.sendMessage(chatId, escapeHtml(text));
    } catch (error) {
      this.logger.warn(`Telegram ask failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      await this.telegram.sendMessage(chatId, askFailureMessage(error, `${dashboardUrl()}/dashboard/settings/billing`));
    } finally {
      clearInterval(typing);
    }
  }

  private rememberThread(chatId: string, projectId: string, conversationId: string) {
    const now = Date.now();
    if (this.askThreads.size >= ASK_THREAD_MAX_ENTRIES) {
      for (const [key, thread] of this.askThreads) if (thread.expiresAt <= now) this.askThreads.delete(key);
      if (this.askThreads.size >= ASK_THREAD_MAX_ENTRIES) this.askThreads.clear();
    }
    this.askThreads.set(chatId, { conversationId, projectId, expiresAt: now + ASK_THREAD_TTL_MS });
  }

  private helpText(): string {
    return [
      'I send a short brief about your TraceIQ project. To connect this chat, open TraceIQ → Alerts → Daily brief and tap Connect Telegram.',
      '',
      'Ask me a question in a private chat, or with /ask <question>.',
      '',
      '/brief asks which one you want',
      '/brief_daily · /brief_weekly · /brief_monthly · /brief_alltime',
      '/stop pauses the scheduled brief'
    ].join('\n');
  }

  /** Builds and sends one brief. Returns 'quiet' when there was nothing to report and `force` is off. */
  private async sendBrief(channel: BriefChannel, options: { force: boolean; period?: BriefPeriod }): Promise<TelegramSendResult | 'quiet'> {
    const project = await this.database.query<{ id: string; name: string; organizationId: string }>(
      `SELECT id, name, organization_id AS "organizationId" FROM projects WHERE id = $1`,
      [channel.projectId]
    );
    if (!project.rows[0]) return { ok: false, status: 404, description: 'Project no longer exists.', permanent: true };

    // What the plan sends on schedule, unless someone asked for a specific period.
    const planCadence = await this.cadenceFor(channel.projectId);
    const period: BriefPeriod = options.period ?? planCadence;
    const { facts, narrative } = await this.insights.getProjectStory(project.rows[0], periodDays(period));
    if (!options.force && isQuietDay(facts)) return 'quiet';

    const input: BriefInput = {
      projectName: project.rows[0].name,
      narrative,
      facts,
      revenue: await this.revenueFor(channel.projectId, periodRevenueInterval(period)),
      dashboardUrl: `${dashboardUrl()}/dashboard`,
      cadence: period,
      // Only the Free plan's weekly brief offers the upgrade; a Pro person asking for a weekly one doesn't.
      upgradeUrl: planCadence === 'weekly' ? `${dashboardUrl()}/dashboard/settings/billing` : undefined
    };

    if (channel.kind === 'slack') {
      const stored = await this.database.query<{ webhookUrl: string | null }>(
        `SELECT webhook_url AS "webhookUrl" FROM brief_channels WHERE id = $1`,
        [channel.id]
      );
      const webhookUrl = stored.rows[0]?.webhookUrl;
      if (!webhookUrl) return { ok: false, status: 0, description: 'This Slack channel has no webhook. Connect it again.', permanent: true };
      return this.slack.sendMessage(webhookUrl, buildSlackBriefMessage(input));
    }
    return this.telegram.sendMessage(channel.chatId, buildBriefMessage(input));
  }

  private async revenueFor(projectId: string, interval: ReturnType<typeof periodRevenueInterval>): Promise<BriefRevenue | null> {
    try {
      const settings = await loadRevenueSettings(this.database, projectId);
      if (!revenueActive(settings)) return null;
      const totals = await queryRevenueTotals(this.database, projectId, settings, interval);
      return { total: totals.total, transactions: totals.transactions, failed: totals.failed, currency: settings.currency };
    } catch {
      // The brief is still worth sending without its revenue line.
      return null;
    }
  }

  private async recordFailure(channel: BriefChannel, localDate: string, result: TelegramSendResult) {
    const reason = (result.description ?? 'The message was not accepted.').slice(0, 300);
    if (result.permanent) {
      // Bot blocked, chat gone or webhook revoked: stop trying until the person reconnects.
      await this.database.query(`UPDATE brief_channels SET enabled = false, last_error = $2, updated_at = now() WHERE id = $1`, [
        channel.id,
        reason
      ]);
      this.logger.warn(`Disabled brief channel ${channel.id}: ${reason}`);
      return;
    }
    // Temporary trouble: give today back so the next minute tries again.
    await this.database.query(
      `UPDATE brief_channels SET last_sent_on = $3::date, last_error = $2, updated_at = now() WHERE id = $1 AND last_sent_on = $4::date`,
      [channel.id, reason, channel.lastSentOn, localDate]
    );
  }
}

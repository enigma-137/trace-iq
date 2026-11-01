import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { InsightsService } from '../insights/insights.service';
import { ProjectsService } from '../projects/projects.service';
import { loadRevenueSettings, queryRevenueTotals, revenueActive } from '../revenue/revenue.util';
import {
  DEFAULT_SEND_HOUR,
  DEFAULT_TIMEZONE,
  LINK_CODE_TTL_MS,
  BriefRevenue,
  buildBriefMessage,
  escapeHtml,
  hashLinkCode,
  isBriefDue,
  isQuietDay,
  isValidTimezone,
  localDateAndHour,
  newLinkCode
} from './briefs.util';
import { TelegramClient, TelegramSendResult } from './telegram.client';

export interface BriefChannel {
  [column: string]: unknown;
  id: string;
  projectId: string;
  kind: 'telegram';
  chatId: string;
  chatName: string | null;
  enabled: boolean;
  sendHour: number;
  timezone: string;
  lastSentOn: string | null;
  lastError: string | null;
}

export interface BriefChannelPatch {
  enabled?: unknown;
  sendHour?: unknown;
  timezone?: unknown;
}

interface TelegramUpdate {
  message?: {
    text?: unknown;
    chat?: { id?: unknown; type?: unknown; title?: unknown; first_name?: unknown; username?: unknown };
  };
}

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
    private readonly telegram: TelegramClient
  ) {}

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
    const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
    const { code, hash } = newLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    await this.database.query(`DELETE FROM brief_link_codes WHERE expires_at < now() OR (project_id = $1 AND user_id = $2)`, [
      project.id,
      user.id
    ]);
    await this.database.query(
      `INSERT INTO brief_link_codes (code_hash, project_id, user_id, kind, timezone, expires_at) VALUES ($1, $2, $3, 'telegram', $4, $5)`,
      [hash, project.id, user.id, zone, expiresAt.toISOString()]
    );

    const bot = this.telegram.botUsername;
    return {
      url: `https://t.me/${bot}?start=${code}`,
      groupUrl: `https://t.me/${bot}?startgroup=${code}`,
      expiresAt: expiresAt.toISOString()
    };
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
      throw new BadRequestException(result.description ?? 'Telegram did not accept the message.');
    }
    return { sent: true };
  }

  /** Handles one update posted by Telegram to the webhook. Never throws: Telegram retries on errors. */
  async handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
    try {
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

      const command = /^\/(\w+)(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(text.trim());
      if (!command) return;
      const [, name, argument] = command;

      switch (name.toLowerCase()) {
        case 'start':
          if (argument) await this.redeemLink(chatId, chatName, argument);
          else await this.telegram.sendMessage(chatId, this.helpText());
          return;
        case 'brief':
          await this.briefForChat(chatId);
          return;
        case 'stop':
          await this.stopChat(chatId);
          return;
        default:
          await this.telegram.sendMessage(chatId, this.helpText());
      }
    } catch (error) {
      this.logger.error(`Telegram update failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /** Called every minute: sends the brief to every channel whose local send time has come. */
  async sendDueBriefs(now = new Date()): Promise<number> {
    if (!this.telegram.isConfigured) return 0;
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE enabled AND kind = 'telegram'`
    );

    let sent = 0;
    for (const channel of channels.rows) {
      const { due, localDate } = isBriefDue(channel, now);
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
    const redeemed = await this.database.query<{ projectId: string; userId: string; timezone: string; expiresAt: string }>(
      `DELETE FROM brief_link_codes WHERE code_hash = $1
       RETURNING project_id AS "projectId", user_id AS "userId", timezone, expires_at AS "expiresAt"`,
      [hashLinkCode(code)]
    );
    const link = redeemed.rows[0];
    if (!link || new Date(link.expiresAt).getTime() < Date.now()) {
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

    await this.telegram.sendMessage(
      chatId,
      `Connected to <b>${escapeHtml(projectName)}</b>. You'll get a short brief here every day at ${String(channel.sendHour).padStart(2, '0')}:00 (${escapeHtml(channel.timezone)}). Change the time in TraceIQ → Alerts → Daily brief.\n\nSend /brief any time for one now, or /stop to pause.`
    );
    // A first brief right away, so the person sees what they signed up for.
    await this.sendBrief(channel, { force: true });
  }

  private async briefForChat(chatId: string) {
    const channels = await this.database.query<BriefChannel>(
      `SELECT ${CHANNEL_COLUMNS} FROM brief_channels WHERE kind = 'telegram' AND chat_id = $1 AND enabled`,
      [chatId]
    );
    if (channels.rows.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        'This chat is not connected to a project yet. In TraceIQ, open Alerts → Daily brief to connect it.'
      );
      return;
    }
    for (const channel of channels.rows) await this.sendBrief(channel, { force: true });
  }

  private async stopChat(chatId: string) {
    await this.database.query(`UPDATE brief_channels SET enabled = false, updated_at = now() WHERE kind = 'telegram' AND chat_id = $1`, [chatId]);
    await this.telegram.sendMessage(chatId, 'Daily briefs paused. Open TraceIQ → Alerts → Daily brief to turn them back on.');
  }

  private helpText(): string {
    return 'I send a short daily brief about your TraceIQ project. To connect this chat, open TraceIQ → Alerts → Daily brief and tap Connect Telegram.\n\n/brief sends one now · /stop pauses them.';
  }

  /** Builds and sends one brief. Returns 'quiet' when there was nothing to report and `force` is off. */
  private async sendBrief(channel: BriefChannel, options: { force: boolean }): Promise<TelegramSendResult | 'quiet'> {
    const project = await this.database.query<{ id: string; name: string; organizationId: string }>(
      `SELECT id, name, organization_id AS "organizationId" FROM projects WHERE id = $1`,
      [channel.projectId]
    );
    if (!project.rows[0]) return { ok: false, status: 404, description: 'Project no longer exists.', permanent: true };

    const { facts, narrative } = await this.insights.getProjectStory(project.rows[0]);
    if (!options.force && isQuietDay(facts)) return 'quiet';

    const message = buildBriefMessage({
      projectName: project.rows[0].name,
      narrative,
      facts,
      revenue: await this.revenueFor(channel.projectId),
      dashboardUrl: `${dashboardUrl()}/dashboard`
    });
    return this.telegram.sendMessage(channel.chatId, message);
  }

  private async revenueFor(projectId: string): Promise<BriefRevenue | null> {
    try {
      const settings = await loadRevenueSettings(this.database, projectId);
      if (!revenueActive(settings)) return null;
      const totals = await queryRevenueTotals(this.database, projectId, settings, '1 day');
      return { total: totals.total, transactions: totals.transactions, failed: totals.failed, currency: settings.currency };
    } catch {
      // The brief is still worth sending without its revenue line.
      return null;
    }
  }

  private async recordFailure(channel: BriefChannel, localDate: string, result: TelegramSendResult) {
    const reason = (result.description ?? 'Telegram did not accept the message.').slice(0, 300);
    if (result.permanent) {
      // Bot blocked or chat gone: stop trying until the person reconnects.
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

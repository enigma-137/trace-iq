import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ChatAlert, buildSlackAlertMessage, buildTelegramAlertMessage } from './briefs.util';
import { SlackClient } from './slack.client';
import { TelegramClient } from './telegram.client';

export interface ChatChannelOption {
  [column: string]: unknown;
  id: string;
  kind: 'telegram' | 'slack';
  name: string;
  enabled: boolean;
}

export interface ChatDelivery {
  channelId: string;
  kind: 'telegram' | 'slack';
  name: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
}

interface ChannelRow {
  [column: string]: unknown;
  id: string;
  kind: 'telegram' | 'slack';
  chatId: string;
  chatName: string | null;
  webhookUrl: string | null;
  enabled: boolean;
}

/**
 * Posts an alert to the chats a project connected for its daily brief. Kept apart from the
 * brief itself (which needs insights, billing and AI) so the alerts module can use it
 * without depending on any of that.
 */
@Injectable()
export class ChatNotifier {
  private readonly logger = new Logger(ChatNotifier.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly telegram: TelegramClient,
    private readonly slack: SlackClient
  ) {}

  /** The project's connected chats, for the alert form. The webhook URL is never selected. */
  async listForProject(projectId: string): Promise<ChatChannelOption[]> {
    const result = await this.database.query<ChatChannelOption>(
      `SELECT id, kind, COALESCE(chat_name, CASE kind WHEN 'slack' THEN 'Slack channel' ELSE 'Telegram chat' END) AS name, enabled
       FROM brief_channels WHERE project_id = $1 ORDER BY created_at`,
      [projectId]
    );
    return result.rows;
  }

  /** The ids that really belong to this project. An alert may only use its own project's chats. */
  async idsInProject(projectId: string, channelIds: string[]): Promise<string[]> {
    if (channelIds.length === 0) return [];
    const result = await this.database.query<{ id: string }>(`SELECT id FROM brief_channels WHERE project_id = $1 AND id = ANY($2::text[])`, [
      projectId,
      channelIds
    ]);
    return result.rows.map((row) => row.id);
  }

  /** Sends the alert to each channel and reports what happened to each. Never throws. */
  async send(projectId: string, channelIds: string[], alert: ChatAlert): Promise<ChatDelivery[]> {
    if (channelIds.length === 0) return [];
    let rows: ChannelRow[] = [];
    try {
      const result = await this.database.query<ChannelRow>(
        `SELECT id, kind, chat_id AS "chatId", chat_name AS "chatName", webhook_url AS "webhookUrl", enabled
         FROM brief_channels WHERE project_id = $1 AND id = ANY($2::text[])`,
        [projectId, channelIds]
      );
      rows = result.rows;
    } catch (error) {
      this.logger.error(`Could not load chat channels for an alert: ${error instanceof Error ? error.message : 'unknown error'}`);
      return channelIds.map((id) => ({ channelId: id, kind: 'slack', name: id, status: 'failed', error: 'Could not load the channel.' }));
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const deliveries: ChatDelivery[] = [];
    for (const id of channelIds) {
      const channel = byId.get(id);
      if (!channel) {
        deliveries.push({ channelId: id, kind: 'slack', name: 'Removed channel', status: 'failed', error: 'This channel was disconnected.' });
        continue;
      }
      deliveries.push(await this.sendOne(channel, alert));
    }
    return deliveries;
  }

  private async sendOne(channel: ChannelRow, alert: ChatAlert): Promise<ChatDelivery> {
    const name = channel.chatName ?? (channel.kind === 'slack' ? 'Slack channel' : 'Telegram chat');
    const base = { channelId: channel.id, kind: channel.kind, name };
    if (!channel.enabled) return { ...base, status: 'skipped', error: 'The channel is paused. Turn it on in Alerts → Daily brief.' };

    try {
      if (channel.kind === 'telegram') {
        if (!this.telegram.isConfigured) return { ...base, status: 'failed', error: 'The Telegram bot is not set up on this server.' };
        const result = await this.telegram.sendMessage(channel.chatId, buildTelegramAlertMessage(alert));
        return this.outcome(channel, base, result);
      }
      if (!channel.webhookUrl) return { ...base, status: 'failed', error: 'This Slack channel has no webhook. Connect it again.' };
      const result = await this.slack.sendMessage(channel.webhookUrl, buildSlackAlertMessage(alert));
      return this.outcome(channel, base, result);
    } catch (error) {
      return { ...base, status: 'failed', error: error instanceof Error ? error.message.slice(0, 200) : 'Could not send.' };
    }
  }

  private async outcome(
    channel: ChannelRow,
    base: { channelId: string; kind: 'telegram' | 'slack'; name: string },
    result: { ok: boolean; description?: string; permanent: boolean }
  ): Promise<ChatDelivery> {
    if (result.ok) return { ...base, status: 'sent', error: null };
    const reason = (result.description ?? 'The message was not accepted.').slice(0, 300);
    if (result.permanent) {
      // Blocked bot, archived channel or revoked webhook: stop sending until it is reconnected,
      // the same rule the daily brief follows.
      await this.database
        .query(`UPDATE brief_channels SET enabled = false, last_error = $2, updated_at = now() WHERE id = $1`, [channel.id, reason])
        .catch(() => undefined);
    }
    return { ...base, status: 'failed', error: reason };
  }
}

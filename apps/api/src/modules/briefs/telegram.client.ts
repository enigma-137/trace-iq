import { Injectable, Logger } from '@nestjs/common';

export interface TelegramSendResult {
  ok: boolean;
  status: number;
  description?: string;
  // The chat can never receive messages again (bot blocked, kicked, or chat gone).
  permanent: boolean;
}

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 10_000;

/** Thin wrapper over the Telegram Bot API. Configured by TELEGRAM_BOT_TOKEN. */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  get token(): string {
    return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  }

  get botUsername(): string {
    return (process.env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  }

  get isConfigured(): boolean {
    return Boolean(this.token && this.botUsername);
  }

  async sendMessage(chatId: string, html: string): Promise<TelegramSendResult> {
    return this.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
  }

  async setWebhook(url: string, secretToken: string): Promise<TelegramSendResult> {
    return this.call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'] });
  }

  private async call(method: string, body: Record<string, unknown>): Promise<TelegramSendResult> {
    if (!this.token) return { ok: false, status: 0, description: 'Telegram is not configured.', permanent: false };
    try {
      const response = await fetch(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      const ok = response.ok && payload.ok !== false;
      // 400 (chat not found), 403 (blocked / kicked) never get better by retrying.
      const permanent = !ok && (response.status === 400 || response.status === 403);
      return { ok, status: response.status, description: payload.description, permanent };
    } catch (error) {
      // Never log the URL: it contains the bot token.
      this.logger.warn(`Telegram ${method} failed: ${error instanceof Error ? error.message : 'network error'}`);
      return { ok: false, status: 0, description: 'Could not reach Telegram.', permanent: false };
    }
  }
}

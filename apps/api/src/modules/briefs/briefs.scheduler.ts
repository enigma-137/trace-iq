import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { TelegramClient } from './telegram.client';

const TICK_MS = 60_000;

/** Checks every minute for briefs whose local send time has arrived. */
@Injectable()
export class BriefsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BriefsScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly briefs: BriefsService,
    private readonly telegram: TelegramClient
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.registerWebhook();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.briefs.sendDueBriefs();
      if (sent > 0) this.logger.log(`Sent ${sent} daily brief${sent === 1 ? '' : 's'}.`);
    } catch (error) {
      this.logger.error(`Daily brief tick failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Points Telegram at this API. Only when TELEGRAM_WEBHOOK_URL is set, so a developer's
   * machine with a copied token can never take the webhook away from production.
   */
  private async registerWebhook(): Promise<void> {
    const url = (process.env.TELEGRAM_WEBHOOK_URL ?? '').trim();
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
    if (!this.telegram.isConfigured || !url || !secret) return;
    const result = await this.telegram.setWebhook(url, secret);
    if (result.ok) this.logger.log('Telegram webhook registered.');
    else this.logger.warn(`Telegram webhook not registered: ${result.description ?? result.status}`);
  }
}

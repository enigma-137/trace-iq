import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReplayService } from './replay.service';

@Injectable()
export class ReplayRetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReplayRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService, private readonly replays: ReplayService) {}

  onApplicationBootstrap() {
    const configured = Number(process.env.REPLAY_RETENTION_SWEEP_INTERVAL_MS ?? 21_600_000);
    const interval = Number.isFinite(configured) ? Math.max(60_000, configured) : 21_600_000;
    this.timer = setInterval(() => void this.database.runExclusive('replay.retention-sweep', () => this.runSweep()).catch((error) => {
      this.logger.error('replay_retention_sweep_failed', error instanceof Error ? error.stack : undefined);
    }), interval);
    this.timer.unref();
  }

  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  async runSweep() {
    const reservations = await this.replays.reconcileStaleUploads();
    const result = await this.database.query<{ id: string }>(`
      SELECT id FROM session_replays
      WHERE (deleted_at IS NULL AND expires_at <= now()) OR status='deleting'
      ORDER BY expires_at LIMIT 100
    `);
    let deleted = 0;
    for (const row of result.rows) {
      if (await this.replays.deleteById(row.id, undefined, 'retention')) deleted += 1;
    }
    if (deleted) this.logger.log(`replay_retention_expired count=${deleted}`);
    return { scanned: result.rows.length, deleted, reservations };
  }
}

import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { appConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';
import { EntitlementService } from './entitlement.service';

interface RetentionProjectRow extends QueryResultRow {
  id: string;
  organization_id: string;
  data_retention_days: number;
}

@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly entitlements: EntitlementService
  ) {}

  onApplicationBootstrap() {
    const configured = Number(process.env.RETENTION_SWEEP_INTERVAL_MS ?? 21_600_000);
    const interval = Number.isFinite(configured) ? Math.max(configured, 60_000) : 21_600_000;
    this.timer = setInterval(() => void this.runSweep().catch((error) => {
      this.logger.error('Retention sweep failed.', error instanceof Error ? error.stack : error);
    }), interval);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runSweep() {
    const projects = await this.database.query<RetentionProjectRow>(`
      SELECT id, organization_id, data_retention_days FROM projects ORDER BY created_at
    `);
    let deletedEvents = 0;

    for (const project of projects.rows) {
      const retentionDays = await this.effectiveRetentionDays(project);
      // Bound each sweep so one large tenant cannot monopolize the worker.
      for (let batch = 0; batch < 20; batch += 1) {
        const result = await this.database.query(`
          DELETE FROM events
          WHERE id IN (
            SELECT id FROM events
            WHERE project_id = $1 AND occurred_at < now() - ($2::int * interval '1 day')
            ORDER BY occurred_at
            LIMIT 1000
          )
        `, [project.id, retentionDays]);
        const count = result.rowCount ?? 0;
        deletedEvents += count;
        if (count < 1000) break;
      }
    }

    if (deletedEvents > 0) this.logger.log(`Retention sweep deleted ${deletedEvents} expired events.`);
    return { projectsScanned: projects.rows.length, deletedEvents };
  }

  private async effectiveRetentionDays(project: RetentionProjectRow) {
    if (appConfig.deploymentMode === 'self_hosted') {
      return Math.max(1, Number(project.data_retention_days) || 365);
    }
    const snapshot = await this.entitlements.getSnapshot(project.organization_id);
    return Math.max(1, snapshot.limits.retentionDays ?? 30);
  }
}


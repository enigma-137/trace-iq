import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';

const SCHEDULER_INTERVAL_MS = 15000; // Tick every 15 seconds
const SWEEPER_INTERVAL_MS = 60000; // Sweep stale runs every 60 seconds

@Injectable()
export class SyntheticSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyntheticSchedulerService.name);
  private readonly replicaId = `replica_${randomUUID().slice(0, 8)}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeperTimer: ReturnType<typeof setInterval> | null = null;
  private isEvaluating = false;

  constructor(private readonly syntheticService: SyntheticMonitoringService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.evaluateDueMonitors(), SCHEDULER_INTERVAL_MS);
      this.sweeperTimer = setInterval(() => void this.sweepStaleRuns(), SWEEPER_INTERVAL_MS);
      this.logger.log(`Synthetic Scheduler initialized [Replica: ${this.replicaId}]`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sweeperTimer) {
      clearInterval(this.sweeperTimer);
      this.sweeperTimer = null;
    }
  }

  async evaluateDueMonitors(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      // Atomically claim due monitors using FOR UPDATE SKIP LOCKED
      const claimedMonitors = await this.syntheticService.claimDueMonitors(this.replicaId, 3);

      if (claimedMonitors.length > 0) {
        this.logger.log(`Replica ${this.replicaId} atomically claimed ${claimedMonitors.length} due monitors.`);
      }

      for (const monitor of claimedMonitors) {
        const runId = `srun_${randomUUID().replace(/-/g, '')}`;

        // Insert queued run and dispatch pipeline
        setImmediate(() => {
          this.syntheticService.executeRunPipeline(monitor, runId, 'scheduled').catch((err) => {
            this.logger.error(`Scheduled run pipeline failed for ${monitor.id}: ${err.message}`, err.stack);
          });
        });
      }
    } catch (err: any) {
      this.logger.error(`Scheduler evaluation error: ${err.message}`);
    } finally {
      this.isEvaluating = false;
    }
  }

  async sweepStaleRuns(): Promise<void> {
    try {
      await this.syntheticService.sweepStaleRuns();
    } catch (err: any) {
      this.logger.error(`Stale run sweeper error: ${err.message}`);
    }
  }
}

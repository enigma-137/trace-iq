import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';

export type StatusComponentKey = 'api' | 'database' | 'ingestion';
export type ComponentStatus = 'operational' | 'degraded' | 'down';
export type HistoryLevel = ComponentStatus | 'none';

export interface PublicStatusDay {
  date: string;
  level: HistoryLevel;
  uptimePercent: number | null;
}

export interface PublicStatusComponent {
  key: StatusComponentKey;
  name: string;
  description: string;
  status: ComponentStatus | 'unknown';
  uptimePercent: number | null;
  history: PublicStatusDay[];
}

/**
 * The only shape the public status endpoint returns. It deliberately carries no
 * hostnames, error messages, latencies, versions or environment names.
 */
export interface PublicStatus {
  status: ComponentStatus;
  generatedAt: string;
  days: number;
  components: PublicStatusComponent[];
}

export interface StatusDayRow extends QueryResultRow {
  component: StatusComponentKey;
  day: string;
  operational: string | number;
  degraded: string | number;
  down: string | number;
}

export interface StatusLatestRow extends QueryResultRow {
  component: StatusComponentKey;
  minute: string | Date;
  status: ComponentStatus;
}

interface PendingCheck {
  component: StatusComponentKey;
  minute: string;
  status: ComponentStatus;
  latencyMs: number | null;
}

export const STATUS_COMPONENTS: readonly { key: StatusComponentKey; name: string; description: string }[] = [
  { key: 'api', name: 'API', description: 'Dashboard, query and SDK endpoints' },
  { key: 'ingestion', name: 'Event ingestion', description: 'Accepting and storing new events' },
  { key: 'database', name: 'Database', description: 'Reads behind dashboards and analytics' }
];

export const STATUS_HISTORY_DAYS = 90;
const CHECK_INTERVAL_MS = 30_000;
const DATABASE_TIMEOUT_MS = 5_000;
const DATABASE_DEGRADED_MS = 1_500;
// Keep up to two days of checks in memory while the database cannot be written.
const MAX_PENDING_CHECKS = 2 * 1_440 * STATUS_COMPONENTS.length;
const SUMMARY_CACHE_MS = 30_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

@Injectable()
export class StatusService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StatusService.name);
  private timer?: NodeJS.Timeout;
  private pending: PendingCheck[] = [];
  private runs = 0;
  private cached?: { at: number; value: PublicStatus };

  constructor(private readonly database: DatabaseService) {}

  onApplicationBootstrap() {
    if (process.env.STATUS_MONITOR_ENABLED === 'false' || process.env.VITEST) return;
    const run = () => void this.recordChecks().catch((error) => {
      this.logger.error('Status check failed.', error instanceof Error ? error.stack : error);
    });
    run();
    this.timer = setInterval(run, CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async recordChecks(now = new Date()) {
    const minute = new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS).toISOString();
    const database = await this.checkDatabase();
    this.pending.push(
      { component: 'api', minute, status: 'operational', latencyMs: null },
      { component: 'database', minute, status: database.status, latencyMs: database.latencyMs }
    );

    // Ingestion depends on the API accepting requests and the database accepting
    // writes, so writing this batch is itself the ingestion check.
    const ingestion: PendingCheck = { component: 'ingestion', minute, status: database.status, latencyMs: null };
    const written = await this.flush([...this.pending, ingestion]);
    if (written) {
      this.pending = [];
    } else {
      this.pending.push({ ...ingestion, status: 'down' });
      if (this.pending.length > MAX_PENDING_CHECKS) this.pending.splice(0, this.pending.length - MAX_PENDING_CHECKS);
    }

    this.runs += 1;
    if (written && this.runs % 120 === 1) {
      await this.database.query(`DELETE FROM status_checks WHERE minute < now() - ($1::int * interval '1 day')`, [STATUS_HISTORY_DAYS + 1]);
    }
  }

  async getPublicStatus(now = new Date()): Promise<PublicStatus> {
    if (this.cached && now.getTime() - this.cached.at < SUMMARY_CACHE_MS) return this.cached.value;
    const since = startOfUtcDay(new Date(now.getTime() - (STATUS_HISTORY_DAYS - 1) * DAY_MS));
    const [days, latest, start] = await Promise.all([
      this.database.query<StatusDayRow>(`
        SELECT component, to_char(date_trunc('day', minute AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          count(*) FILTER (WHERE status = 'operational') AS operational,
          count(*) FILTER (WHERE status = 'degraded') AS degraded,
          count(*) FILTER (WHERE status = 'down') AS down
        FROM status_checks
        WHERE minute >= $1
        GROUP BY 1, 2
      `, [since.toISOString()]),
      this.database.query<StatusLatestRow>(`
        SELECT DISTINCT ON (component) component, minute, status
        FROM status_checks
        ORDER BY component, minute DESC
      `),
      this.database.query<{ first_minute: string | Date | null }>(`SELECT min(minute) AS first_minute FROM status_checks`)
    ]);
    const firstMinute = start.rows[0]?.first_minute;
    const value = buildPublicStatus({
      dayRows: days.rows,
      latestRows: latest.rows,
      monitoringStart: firstMinute ? new Date(firstMinute) : null,
      now
    });
    this.cached = { at: now.getTime(), value };
    return value;
  }

  private async checkDatabase(): Promise<{ status: ComponentStatus; latencyMs: number | null }> {
    const started = Date.now();
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.database.query('SELECT 1'),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), DATABASE_TIMEOUT_MS); })
      ]);
      const latencyMs = Date.now() - started;
      return { status: latencyMs > DATABASE_DEGRADED_MS ? 'degraded' : 'operational', latencyMs };
    } catch {
      return { status: 'down', latencyMs: null };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async flush(checks: PendingCheck[]) {
    const values: unknown[] = [];
    const tuples = checks.map((check, index) => {
      values.push(check.component, check.minute, check.status, check.latencyMs);
      const base = index * 4;
      return `($${base + 1}, $${base + 2}::timestamptz, $${base + 3}, $${base + 4}::int)`;
    });
    try {
      // Several checks land in the same minute; keep the worst one.
      await this.database.query(`
        INSERT INTO status_checks (component, minute, status, latency_ms)
        VALUES ${tuples.join(', ')}
        ON CONFLICT (component, minute) DO UPDATE SET
          status = CASE
            WHEN status_checks.status = 'down' OR EXCLUDED.status = 'down' THEN 'down'
            WHEN status_checks.status = 'degraded' OR EXCLUDED.status = 'degraded' THEN 'degraded'
            ELSE 'operational'
          END,
          latency_ms = GREATEST(status_checks.latency_ms, EXCLUDED.latency_ms)
      `, values);
      return true;
    } catch (error) {
      this.logger.warn(`Could not record status checks: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }
}

/**
 * Turns per-day minute counts into the public summary.
 *
 * A day's measured minutes run from the later of midnight UTC and the first
 * recorded check up to the earlier of the next midnight and the start of the
 * current minute, which may not have been checked yet. Minutes with no
 * row mean the API was not running, so they count as downtime for the API and
 * ingestion. The database is only judged on minutes the API could check it.
 */
export function buildPublicStatus(input: {
  dayRows: StatusDayRow[];
  latestRows: StatusLatestRow[];
  monitoringStart: Date | null;
  now: Date;
  days?: number;
}): PublicStatus {
  const days = input.days ?? STATUS_HISTORY_DAYS;
  const nowMs = input.now.getTime();
  const currentMinute = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
  const counts = new Map<string, { operational: number; degraded: number; down: number }>();
  for (const row of input.dayRows) {
    counts.set(`${row.component}:${row.day}`, {
      operational: Number(row.operational), degraded: Number(row.degraded), down: Number(row.down)
    });
  }
  const latest = new Map(input.latestRows.map((row) => [row.component, row]));
  const today = startOfUtcDay(input.now).getTime();

  const components = STATUS_COMPONENTS.map(({ key, name, description }) => {
    let upMinutes = 0;
    let measuredMinutes = 0;
    const history: PublicStatusDay[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const dayStart = today - offset * DAY_MS;
      const date = new Date(dayStart).toISOString().slice(0, 10);
      const count = counts.get(`${key}:${date}`) ?? { operational: 0, degraded: 0, down: 0 };
      const recorded = count.operational + count.degraded + count.down;
      const windowStart = Math.max(dayStart, input.monitoringStart?.getTime() ?? Number.POSITIVE_INFINITY);
      const windowEnd = Math.min(dayStart + DAY_MS, currentMinute);
      const expected = windowEnd > windowStart ? Math.floor((windowEnd - windowStart) / MINUTE_MS) : 0;
      const missing = key === 'database' ? 0 : Math.max(0, expected - recorded);
      const measured = recorded + missing;
      if (!measured) {
        history.push({ date, level: 'none', uptimePercent: null });
        continue;
      }
      const up = count.operational + count.degraded;
      upMinutes += up;
      measuredMinutes += measured;
      const uptime = (up / measured) * 100;
      history.push({ date, level: historyLevel(uptime, count.degraded / measured), uptimePercent: roundPercent(uptime) });
    }

    const last = latest.get(key);
    const lastMs = last ? new Date(last.minute).getTime() : Number.NaN;
    // A check is recorded every 30 seconds; three silent minutes mean the API stopped.
    const fresh = Number.isFinite(lastMs) && nowMs - lastMs <= 3 * MINUTE_MS;
    const status: PublicStatusComponent['status'] = !last ? 'unknown' : fresh ? last.status : key === 'database' ? 'unknown' : 'down';
    return {
      key, name, description, status,
      uptimePercent: measuredMinutes ? roundPercent((upMinutes / measuredMinutes) * 100) : null,
      history
    };
  });

  const statuses = components.map((component) => component.status);
  const overall: ComponentStatus = statuses.includes('down') ? 'down'
    : statuses.includes('degraded') || statuses.includes('unknown') ? 'degraded' : 'operational';
  return { status: overall, generatedAt: input.now.toISOString(), days, components };
}

function historyLevel(uptimePercent: number, degradedShare: number): ComponentStatus {
  if (uptimePercent < 99) return 'down';
  if (uptimePercent < 99.9 || degradedShare > 0.05) return 'degraded';
  return 'operational';
}

// Rounds down so a day with any downtime never shows as a perfect 100%.
function roundPercent(value: number) {
  return Math.floor(value * 100) / 100;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

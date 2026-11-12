import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AiService } from '../ai/ai.service';
import { DigestService, DigestPayload, buildDigestEmail } from './digest.service';
import {
  FAILURE_KIND_SQL,
  FailureFacts,
  ProjectHealthResponse,
  STATUS_INT,
  classifyHealth,
  describeFailures,
  emptyFailureFacts,
  failureNarrative,
  hasRecovered
} from './failure-facts';

export * from './failure-facts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoryFactLine {
  label: string;
  value: string;
}

export interface TodayStoryFacts {
  eventsToday: number;
  eventsYesterday: number;
  deltaPct: number | null;
  uniquesToday: number;
  topEvent: { name: string; count: number } | null;
  topCountry: { name: string; count: number; pct: number } | null;
  topDevice: { name: string; count: number } | null;
  activeNow: number;
  lastEventAt: string | null;
  /** What went wrong in the same window. Leads the story whenever anything did. */
  failures: FailureFacts;
}

export interface TodayStoryResponse {
  project: { id: string; name: string; organizationName: string } | null;
  narrative: string;
  model: string;
  generatedAt: string;
  facts: TodayStoryFacts;
}

export interface NowActivityEvent {
  [column: string]: unknown;
  id: string;
  eventName: string;
  actor: string | null;
  path: string | null;
  country: string | null;
  device: string | null;
  occurredAt: string;
}

export interface NowActivityResponse {
  project: { id: string; name: string } | null;
  windowMinutes: number;
  total: number;
  uniques: number;
  events: NowActivityEvent[];
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly ai: AiService,
    private readonly digest: DigestService
  ) {}

  /**
   * Digest preview for the dashboard: the current month's summary for the
   * caller's active project's organization, plus the rendered HTML string so the
   * page can show exactly what the email will look like.
   */
  async peekDigest(user: DashboardUser, projectId?: string): Promise<{
    period: string;
    payload: DigestPayload;
    html: string;
  } | null> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return null;

    const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const payload = await this.digest.collectForOrganization(project.organizationId, period);
    if (payload.projects.length === 0) return null;
    return { period, payload, html: buildDigestEmail(payload) };
  }

  /**
   * Computes the structured facts behind the "today's story" and produces a
   * plain-English narrative. The template narrative is always available (fast,
   * deterministic); when CENCORI_API_KEY is configured the AI upgrades it to a
   * fuller story, and any failure falls back to the template.
   */
  async getTodayStory(user: DashboardUser, projectId?: string): Promise<TodayStoryResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId);

    if (!project) {
      return {
        project: null,
        narrative:
          'No project yet. Create your project and install the SDK, and tomorrow you will wake up to a story of what happened today.',
        model: 'template',
        generatedAt: new Date().toISOString(),
        facts: this.emptyFacts()
      };
    }

    const facts = await this.computeFacts(project.id);
    const template = this.templateNarrative(facts);

    if (facts.eventsToday + facts.eventsYesterday === 0) {
      return {
        project: { id: project.id, name: project.name, organizationName: project.organizationName },
        narrative: template,
        model: 'template',
        generatedAt: new Date().toISOString(),
        facts
      };
    }

    const aiNarrative = await this.ai.generateStoryNarrative(project, facts, user.id);
    const narrative = aiNarrative ?? template;

    return {
      project: { id: project.id, name: project.name, organizationName: project.organizationName },
      narrative,
      model: narrative === template ? 'template' : 'cencori',
      generatedAt: new Date().toISOString(),
      facts
    };
  }

  /**
   * A project as facts plus a narrative, for messages that go out without a signed-in user
   * (the brief). `windowDays` 1 is the last 24 hours against the 24 before, with the same
   * AI narrative as the story card. 7 or 30 compare that many days with the same number before,
   * and 'all' covers everything since the first event with nothing to compare against. All of
   * those use plain template wording: the AI prompt is written for a single day.
   */
  async getProjectStory(
    project: { id: string; name: string; organizationId: string },
    windowDays: number | 'all' = 1
  ): Promise<{ facts: TodayStoryFacts; narrative: string }> {
    const facts = await this.computeFacts(project.id, windowDays);
    const template = this.templateNarrative(facts, windowDays);
    if (windowDays !== 1 || facts.eventsToday + facts.eventsYesterday === 0) return { facts, narrative: template };

    const aiNarrative = await this.ai.generateStoryNarrative(project, facts).catch(() => null);
    return { facts, narrative: aiNarrative ?? template };
  }

  /**
   * "Now" feed for the overview: the events received in the last `minutes`,
   * with the actor, page path, country and device. Used by the live activity
   * panel which polls this endpoint rather than opening a socket.
   */
  async getNowActivity(user: DashboardUser, projectId?: string, minutesParam?: string): Promise<NowActivityResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const windowMinutes = this.clampMinutes(minutesParam);

    if (!project) {
      return { project: null, windowMinutes, total: 0, uniques: 0, events: [] };
    }

    const windowStart = new Date(Date.now() - windowMinutes * 60_000);

    const totals = await this.database.query<{ total: number; uniques: number }>(
      `
        SELECT
          count(*)::int AS total,
          count(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS uniques
        FROM events
        WHERE project_id = $1 AND occurred_at >= $2
      `,
      [project.id, windowStart.toISOString()]
    );

    const recent = await this.database.query<NowActivityEvent>(
      `
        SELECT
          e.id,
          e.event_name AS "eventName",
          COALESCE(u.external_id, e.anonymous_id) AS actor,
          NULLIF(e.context->'page'->>'path', '') AS path,
          NULLIF(e.network_info->>'country', '') AS country,
          COALESCE(nullif(e.device_info->>'deviceType', ''), nullif(e.device_info->>'os', '')) AS device,
          e.occurred_at AS "occurredAt"
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1 AND e.occurred_at >= $2
        ORDER BY e.occurred_at DESC
        LIMIT 40
      `,
      [project.id, windowStart.toISOString()]
    );

    return {
      project: { id: project.id, name: project.name },
      windowMinutes,
      total: totals.rows[0]?.total ?? 0,
      uniques: totals.rows[0]?.uniques ?? 0,
      events: recent.rows
    };
  }

  /** Project health from the last `minutes` of data, for the header pill and the overview banner. */
  async getHealth(user: DashboardUser, projectId?: string, minutesParam?: string): Promise<ProjectHealthResponse> {
    const project = await this.projects.resolveActiveProject(user, projectId);
    const parsed = minutesParam ? Number(minutesParam) : NaN;
    const windowMinutes = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 5), 24 * 60) : 60;
    const checkedAt = new Date().toISOString();
    if (!project) {
      return { project: null, status: 'idle', summary: 'No project selected', windowMinutes, failures: emptyFailureFacts(), checkedAt };
    }

    const since = new Date(Date.now() - windowMinutes * 60_000);
    const [failures, eventCount] = await Promise.all([
      this.computeFailures(project.id, since),
      this.database
        .query<{ count: number }>(`SELECT count(*)::int AS count FROM events WHERE project_id = $1 AND occurred_at >= $2`, [
          project.id,
          since.toISOString()
        ])
        .then((result) => result.rows[0]?.count ?? 0)
        .catch(() => 0)
    ]);
    const status = classifyHealth(failures, eventCount);
    const window = windowMinutes % 60 === 0 ? `${windowMinutes / 60}h` : `${windowMinutes}m`;
    const summary =
      status === 'idle'
        ? `No traffic in the last ${window}`
        : status === 'operational'
          ? 'All systems operational'
          : `${status === 'outage' ? 'Outage' : 'Degraded'}: ${describeFailures(failures)} in the last ${window}`;
    return { project: { id: project.id, name: project.name }, status, summary, windowMinutes, failures, checkedAt };
  }

  /** Failures since `since`, counted with the shared rules in common/failures.ts. */
  private async computeFailures(projectId: string, since: Date): Promise<FailureFacts> {
    const params = [projectId, since.toISOString()];
    const scoped = `
      SELECT event_name, properties, occurred_at, COALESCE(user_id::text, anonymous_id) AS actor, ${FAILURE_KIND_SQL} AS kind
      FROM events
      WHERE project_id = $1 AND occurred_at >= $2
    `;
    const none = (error: unknown): { rows: never[] } => {
      this.logger.warn(`Failure facts query failed: ${error instanceof Error ? error.message : String(error)}`);
      return { rows: [] };
    };
    const [totals, topError, topRequest, topAction] = await Promise.all([
      this.database
        .query<{
          exceptions: number;
          failed_requests: number;
          network_errors: number;
          server_errors: number;
          total_requests: number;
          failed_actions: number;
          affected_users: number;
          first_at: string | Date | null;
          last_at: string | Date | null;
          last_network_at: string | Date | null;
          recovered_at: string | Date | null;
        }>(
          `
            WITH f AS (${scoped}),
            t AS (
            SELECT
              count(*) FILTER (WHERE kind = 'exception')::int AS exceptions,
              count(*) FILTER (WHERE kind = 'request')::int AS failed_requests,
              count(*) FILTER (WHERE kind = 'request' AND ${STATUS_INT} = 0)::int AS network_errors,
              count(*) FILTER (WHERE kind = 'request' AND ${STATUS_INT} >= 500)::int AS server_errors,
              count(*) FILTER (WHERE event_name = '$api_request')::int AS total_requests,
              count(*) FILTER (WHERE kind = 'action')::int AS failed_actions,
              count(DISTINCT actor) FILTER (WHERE kind IS NOT NULL)::int AS affected_users,
              min(occurred_at) FILTER (WHERE kind IS NOT NULL) AS first_at,
              max(occurred_at) FILTER (WHERE kind IS NOT NULL) AS last_at,
              max(occurred_at) FILTER (WHERE kind = 'request' AND ${STATUS_INT} = 0) AS last_network_at
            FROM f
            )
            SELECT t.*,
              -- Any answer at all, even a 4xx, means the backend is reachable again.
              (
                SELECT min(occurred_at) FROM f
                WHERE f.event_name = '$api_request' AND ${STATUS_INT} > 0 AND f.occurred_at > t.last_network_at
              ) AS recovered_at
            FROM t
          `,
          params
        )
        .catch(none),
      this.database
        .query<{ type: string; message: string; count: number; users: number }>(
          `
            WITH f AS (${scoped})
            SELECT
              COALESCE(NULLIF(properties->>'type', ''), 'Error') AS type,
              COALESCE(NULLIF(properties->>'message', ''), '(no message)') AS message,
              count(*)::int AS count,
              count(DISTINCT actor)::int AS users
            FROM f WHERE kind = 'exception'
            GROUP BY 1, 2 ORDER BY count DESC LIMIT 1
          `,
          params
        )
        .catch(none),
      this.database
        .query<{ method: string; path: string; status: number; count: number }>(
          `
            WITH f AS (${scoped})
            SELECT
              COALESCE(NULLIF(properties->>'method', ''), 'GET') AS method,
              COALESCE(NULLIF(properties->>'path', ''), '/') AS path,
              ${STATUS_INT} AS status,
              count(*)::int AS count
            FROM f WHERE kind = 'request'
            GROUP BY 1, 2, 3 ORDER BY count DESC LIMIT 1
          `,
          params
        )
        .catch(none),
      this.database
        .query<{ name: string; count: number; users: number }>(
          `
            WITH f AS (${scoped})
            SELECT event_name AS name, count(*)::int AS count, count(DISTINCT actor)::int AS users
            FROM f WHERE kind = 'action'
            GROUP BY 1 ORDER BY count DESC LIMIT 1
          `,
          params
        )
        .catch(none)
    ]);

    const row = totals.rows[0];
    if (!row) return emptyFailureFacts();
    const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : null);
    return {
      exceptions: row.exceptions ?? 0,
      failedRequests: row.failed_requests ?? 0,
      networkErrors: row.network_errors ?? 0,
      serverErrors: row.server_errors ?? 0,
      totalRequests: row.total_requests ?? 0,
      failedActions: row.failed_actions ?? 0,
      affectedUsers: row.affected_users ?? 0,
      topError: topError.rows[0] ?? null,
      topFailedRequest: topRequest.rows[0] ?? null,
      topFailedAction: topAction.rows[0] ?? null,
      firstAt: iso(row.first_at),
      lastAt: iso(row.last_at),
      lastNetworkErrorAt: iso(row.last_network_at ?? null),
      recoveredAt: iso(row.recovered_at ?? null)
    };
  }

  /** `eventsToday` / `eventsYesterday` are the latest window and the one before it, whatever its length. */
  private async computeFacts(projectId: string, windowDays: number | 'all' = 1): Promise<TodayStoryFacts> {
    const now = Date.now();
    // 'all' starts at the epoch with an empty "before" window (both starts equal, so the previous
    // window is the empty range), so nothing is compared and the percentage stays null.
    const todayStart = windowDays === 'all' ? new Date(0) : new Date(now - windowDays * DAY_MS);
    const yesterdayStart = windowDays === 'all' ? new Date(0) : new Date(now - 2 * windowDays * DAY_MS);

    const [totals, topEvent, topCountry, topDevice, lastEvent, failures] = await Promise.all([
      this.database.query<{ today: number; yesterday: number; uniques_today: number; active_now: number }>(
        `
          SELECT
            (SELECT count(*) FROM events WHERE project_id = $1 AND occurred_at >= $2)::int AS today,
            (SELECT count(*) FROM events WHERE project_id = $1 AND occurred_at >= $3 AND occurred_at < $2)::int AS yesterday,
            (SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id)) FROM events WHERE project_id = $1 AND occurred_at >= $2)::int AS uniques_today,
            (SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id)) FROM events WHERE project_id = $1 AND occurred_at >= now() - interval '15 minutes')::int AS active_now
        `,
        [projectId, todayStart.toISOString(), yesterdayStart.toISOString()]
      ),
      this.database.query<{ name: string; count: number }>(
        `
          SELECT event_name AS name, count(*)::int AS count
          FROM events
          WHERE project_id = $1 AND occurred_at >= $2
          GROUP BY event_name
          ORDER BY count DESC
          LIMIT 1
        `,
        [projectId, todayStart.toISOString()]
      ),
      this.database.query<{ name: string; count: number }>(
        `
          SELECT network_info->>'country' AS name, count(*)::int AS count
          FROM events
          WHERE project_id = $1 AND occurred_at >= $2
            AND NULLIF(network_info->>'country', '') IS NOT NULL
            AND network_info->>'country' != 'unknown'
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 1
        `,
        [projectId, todayStart.toISOString()]
      ),
      this.database.query<{ name: string; count: number }>(
        `
          SELECT COALESCE(NULLIF(device_info->>'deviceType', ''), NULLIF(device_info->>'os', ''), 'unknown') AS name, count(*)::int AS count
          FROM events
          WHERE project_id = $1 AND occurred_at >= $2
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 1
        `,
        [projectId, todayStart.toISOString()]
      ),
      this.database.query<{ value: string }>(
        `SELECT max(occurred_at) AS value FROM events WHERE project_id = $1`,
        [projectId]
      ),
      this.computeFailures(projectId, todayStart)
    ]);

    const row = totals.rows[0];
    const today = row?.today ?? 0;
    const yesterday = row?.yesterday ?? 0;

    const deltaPct =
      yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : today > 0 ? null : 0;

    const topCountryFact: TodayStoryFacts['topCountry'] = topCountry.rows[0]
      ? {
          name: topCountry.rows[0].name,
          count: topCountry.rows[0].count,
          pct: today > 0 ? Math.round((topCountry.rows[0].count / today) * 100) : 0
        }
      : null;

    return {
      eventsToday: today,
      eventsYesterday: yesterday,
      deltaPct,
      uniquesToday: row?.uniques_today ?? 0,
      topEvent: topEvent.rows[0] ?? null,
      topCountry: topCountryFact,
      topDevice: topDevice.rows[0] ?? null,
      activeNow: row?.active_now ?? 0,
      lastEventAt: lastEvent.rows[0]?.value ?? null,
      failures
    };
  }

  private templateNarrative(facts: TodayStoryFacts, windowDays: number | 'all' = 1): string {
    const allTime = windowDays === 'all';
    const monthly = windowDays === 30;
    const weekly = windowDays === 7 || (typeof windowDays === 'number' && windowDays > 1 && !monthly);
    const span = allTime
      ? { now: 'in total', previous: '', last: 'since the start' }
      : monthly
        ? { now: 'this month', previous: 'last month', last: 'the last 30 days' }
        : weekly
          ? { now: 'this week', previous: 'last week', last: 'the last 7 days' }
          : { now: 'today', previous: 'yesterday', last: 'the last 24 hours' };

    if (facts.eventsToday + facts.eventsYesterday === 0) {
      return allTime
        ? 'No events yet. As soon as your SDK starts sending, the story of your project shows up here.'
        : monthly
          ? 'No events this month. As soon as your SDK starts sending, the story of your month shows up here.'
          : weekly
            ? 'No events this week. As soon as your SDK starts sending, the story of your week shows up here.'
            : 'No events today. As soon as your SDK starts sending, the story of your day shows up here.';
    }

    const parts: string[] = [];

    // Failures lead while the backend is unreachable: someone reading the story should
    // learn about an outage first. Once it answers again they follow the activity.
    const failureLine = failureNarrative(facts.failures, span.last);
    const resolved = hasRecovered(facts.failures);
    if (failureLine && !resolved) parts.push(failureLine);

    if (allTime) {
      parts.push(`Your project has recorded ${facts.eventsToday.toLocaleString()} events ${span.last}.`);
    } else if (facts.deltaPct === null) {
      parts.push(`Your project saw ${facts.eventsToday.toLocaleString()} events in ${span.last} — a clean start.`);
    } else if (facts.deltaPct > 0) {
      parts.push(`Events are up ${facts.deltaPct}% ${span.now} (${facts.eventsToday.toLocaleString()} vs ${facts.eventsYesterday.toLocaleString()} ${span.previous}).`);
    } else if (facts.deltaPct < 0) {
      parts.push(`Events dipped ${Math.abs(facts.deltaPct)}% ${span.now} (${facts.eventsToday.toLocaleString()} vs ${facts.eventsYesterday.toLocaleString()} ${span.previous}).`);
    } else {
      parts.push(`Event volume is flat — ${facts.eventsToday.toLocaleString()} ${span.now}, the same as ${span.previous}.`);
    }

    if (failureLine && resolved) parts.push(failureLine);

    if (facts.topEvent) {
      parts.push(`Top event: ${facts.topEvent.name} (${facts.topEvent.count.toLocaleString()}).`);
    }

    if (facts.topCountry && facts.topCountry.name !== 'unknown') {
      parts.push(`${facts.topCountry.pct}% of activity came from ${facts.topCountry.name}.`);
    }

    if (facts.topDevice && facts.topDevice.name !== 'unknown') {
      parts.push(`Leading device: ${facts.topDevice.name}.`);
    }

    if (facts.activeNow > 0) {
      parts.push(`${facts.activeNow} ${facts.activeNow === 1 ? 'actor is' : 'actors are'} active right now.`);
    }

    return parts.join(' ');
  }


  private emptyFacts(): TodayStoryFacts {
    return {
      eventsToday: 0,
      eventsYesterday: 0,
      deltaPct: 0,
      uniquesToday: 0,
      topEvent: null,
      topCountry: null,
      topDevice: null,
      activeNow: 0,
      lastEventAt: null,
      failures: emptyFailureFacts()
    };
  }

  private clampMinutes(value?: string): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return 15;
    }
    return Math.min(Math.max(Math.trunc(parsed), 5), 120);
  }
}
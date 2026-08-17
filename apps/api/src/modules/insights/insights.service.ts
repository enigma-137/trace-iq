import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AiService, AI_MODEL } from '../ai/ai.service';
import { DigestService, DigestPayload, buildDigestEmail } from './digest.service';

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
   * deterministic); when GROQ_API_KEY is configured the AI upgrades it to a
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

    const prompt = this.buildStoryPrompt(project, facts);
    const aiNarrative = await this.ai.completeSafely(prompt);
    const narrative = aiNarrative ?? template;

    return {
      project: { id: project.id, name: project.name, organizationName: project.organizationName },
      narrative,
      model: narrative === template ? 'template' : AI_MODEL,
      generatedAt: new Date().toISOString(),
      facts
    };
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

  private async computeFacts(projectId: string): Promise<TodayStoryFacts> {
    const now = Date.now();
    const todayStart = new Date(now - DAY_MS);
    const yesterdayStart = new Date(now - 2 * DAY_MS);

    const [totals, topEvent, topCountry, topDevice, lastEvent] = await Promise.all([
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
          SELECT COALESCE(NULLIF(network_info->>'country', ''), 'unknown') AS name, count(*)::int AS count
          FROM events
          WHERE project_id = $1 AND occurred_at >= $2
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
      )
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
      lastEventAt: lastEvent.rows[0]?.value ?? null
    };
  }

  private templateNarrative(facts: TodayStoryFacts): string {
    if (facts.eventsToday + facts.eventsYesterday === 0) {
      return 'No events today. As soon as your SDK starts sending, the story of your day shows up here.';
    }

    const parts: string[] = [];

    if (facts.deltaPct === null) {
      parts.push(`Your project saw ${facts.eventsToday.toLocaleString()} events in the last 24 hours — a clean start.`);
    } else if (facts.deltaPct > 0) {
      parts.push(`Events are up ${facts.deltaPct}% today (${facts.eventsToday.toLocaleString()} vs ${facts.eventsYesterday.toLocaleString()} yesterday).`);
    } else if (facts.deltaPct < 0) {
      parts.push(`Events dipped ${Math.abs(facts.deltaPct)}% today (${facts.eventsToday.toLocaleString()} vs ${facts.eventsYesterday.toLocaleString()} yesterday).`);
    } else {
      parts.push(`Event volume is flat — ${facts.eventsToday.toLocaleString()} today, the same as yesterday.`);
    }

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

  private buildStoryPrompt(project: { name: string }, facts: TodayStoryFacts): string {
    const country = facts.topCountry && facts.topCountry.name !== 'unknown' ? `${facts.topCountry.name} (${facts.topCountry.pct}% of activity)` : 'no single dominant country';
    return [
      `Write "Today's story" for the TraceIQ project "${project.name}" in 2-3 short, friendly sentences.`,
      `Use only these numbers:`,
      `- events in the last 24h: ${facts.eventsToday}, previous 24h: ${facts.eventsYesterday}, delta: ${facts.deltaPct === null ? 'new' : `${facts.deltaPct}%`}`,
      `- unique users today: ${facts.uniquesToday}`,
      `- top event: ${facts.topEvent ? `${facts.topEvent.name} (${facts.topEvent.count})` : 'none yet'}`,
      `- geography: ${country}`,
      `- active right now: ${facts.activeNow}`,
      '',
      "Plain language, no bullet points, no emojis, no 'In summary'. Never invent numbers."
    ].join('\n');
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
      lastEventAt: null
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
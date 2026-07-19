import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export interface ExportEventsQuery {
  projectId?: string;
  from?: string;
  to?: string;
  event?: string;
  limit?: string | number;
}

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 50_000;
const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class ExportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async exportEvents(user: DashboardUser, query: ExportEventsQuery) {
    const project = await this.projects.requireActiveProject(user, query.projectId);

    const to = parseDate(query.to) ?? new Date();
    const from = parseDate(query.from) ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must be before "to".');
    }
    const limit = clampInt(query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
    const event = typeof query.event === 'string' && query.event.trim() ? query.event.trim() : null;

    const params: unknown[] = [project.id, from.toISOString(), to.toISOString()];
    let eventClause = '';
    if (event) {
      params.push(event);
      eventClause = ` AND e.event_name = $${params.length}`;
    }
    params.push(limit);

    const result = await this.database.query<Record<string, unknown>>(
      `
        SELECT
          e.id,
          e.occurred_at AS "occurredAt",
          e.event_name AS "eventName",
          COALESCE(u.external_id, e.user_id::text, e.anonymous_id) AS "distinctId",
          u.external_id AS "userId",
          e.anonymous_id AS "anonymousId",
          e.session_id AS "sessionId",
          e.network_info->>'country' AS "country",
          e.network_info->>'region' AS "region",
          e.network_info->>'city' AS "city",
          e.device_info->>'os' AS "os",
          e.device_info->>'deviceType' AS "deviceType",
          e.device_info->>'browser' AS "browser",
          e.properties
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1 AND e.occurred_at >= $2 AND e.occurred_at < $3${eventClause}
        ORDER BY e.occurred_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    return {
      project: { id: project.id, name: project.name },
      from: from.toISOString(),
      to: to.toISOString(),
      event,
      limit,
      count: result.rows.length,
      truncated: result.rows.length >= limit,
      events: result.rows
    };
  }
}

function parseDate(value?: string): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`"${value}" is not a valid date.`);
  }
  return parsed;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

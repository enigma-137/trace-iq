import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export type PersonSummary = {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  traits: Record<string, unknown>;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type PersonProfile = {
  id: string;
  externalId: string | null;
  anonymousId: string | null;
  traits: Record<string, unknown>;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sessionCount: number;
  lastOs: string | null;
  lastDeviceType: string | null;
  lastBrowser: string | null;
  lastCountry: string | null;
  lastCity: string | null;
};

export type TimelineItem = {
  id: string;
  eventName: string;
  properties: Record<string, unknown>;
  sessionId: string | null;
  occurredAt: string;
  receivedAt: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async listPersons(
    user: DashboardUser,
    params: { search?: string; limit?: string; offset?: string; projectId?: string }
  ): Promise<{ project: unknown; persons: PersonSummary[]; limit: number; offset: number }> {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    const limit = this.clamp(params.limit, 25, 1, 100);
    const offset = this.clamp(params.offset, 0, 0, 100000);
    const search = this.optionalString(params.search) ?? null;

    if (!project) {
      return { project: null, persons: [], limit, offset };
    }

    const result = await this.database.query<PersonSummary>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt",
          (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS "eventCount"
        FROM users u
        WHERE u.project_id = $1
          AND (
            $2::text IS NULL
            OR u.external_id ILIKE '%' || $2 || '%'
            OR u.anonymous_id ILIKE '%' || $2 || '%'
            OR u.id ILIKE '%' || $2 || '%'
          )
        ORDER BY u.last_seen_at DESC
        LIMIT $3 OFFSET $4
      `,
      [project.id, search, limit, offset]
    );

    return { project, persons: result.rows, limit, offset };
  }

  async getPerson(user: DashboardUser, personId: string, projectId?: string): Promise<PersonProfile> {
    const project = await this.projects.requireActiveProject(user, projectId);

    const result = await this.database.query<PersonProfile>(
      `
        SELECT
          u.id,
          u.external_id AS "externalId",
          u.anonymous_id AS "anonymousId",
          u.traits,
          u.first_seen_at AS "firstSeenAt",
          u.last_seen_at AS "lastSeenAt",
          (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS "eventCount",
          (SELECT count(*) FROM sessions s WHERE s.user_id = u.id)::int AS "sessionCount",
          (SELECT e.device_info->>'os' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'os','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastOs",
          (SELECT e.device_info->>'deviceType' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'deviceType','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastDeviceType",
          (SELECT e.device_info->>'browser' FROM events e WHERE e.user_id = u.id AND NULLIF(e.device_info->>'browser','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastBrowser",
          (SELECT e.network_info->>'country' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'country','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCountry",
          (SELECT e.network_info->>'city' FROM events e WHERE e.user_id = u.id AND NULLIF(e.network_info->>'city','') IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) AS "lastCity"
        FROM users u
        WHERE u.id = $1 AND u.project_id = $2
        LIMIT 1
      `,
      [personId, project.id]
    );

    const person = result.rows[0];
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    return person;
  }

  async getTimeline(
    user: DashboardUser,
    personId: string,
    params: { limit?: string; offset?: string; projectId?: string }
  ): Promise<{ items: TimelineItem[]; limit: number; offset: number }> {
    const project = await this.projects.requireActiveProject(user, params.projectId);
    // Ensure the person belongs to this project before returning their events.
    await this.getPerson(user, personId, project.id);

    const limit = this.clamp(params.limit, 50, 1, 200);
    const offset = this.clamp(params.offset, 0, 0, 100000);

    const result = await this.database.query<TimelineItem>(
      `
        SELECT
          e.id,
          e.event_name AS "eventName",
          e.properties,
          e.session_id AS "sessionId",
          e.occurred_at AS "occurredAt",
          e.received_at AS "receivedAt"
        FROM events e
        WHERE e.project_id = $1 AND e.user_id = $2
        ORDER BY e.occurred_at DESC
        LIMIT $3 OFFSET $4
      `,
      [project.id, personId, limit, offset]
    );

    return { items: result.rows, limit, offset };
  }

  private clamp(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = value ? Number(value) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

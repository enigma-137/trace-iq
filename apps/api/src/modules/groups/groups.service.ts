import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { resolveDisplayName, sanitizeTraitsPreview } from '../users/users.service';

export const GROUP_EVENT = '$group';
const DAY_OPTIONS = [7, 14, 30, 90];
const DEFAULT_DAYS = 30;
const MAX_KEY_LENGTH = 200;
const MAX_GROUPS = 200;
const MAX_MEMBERS = 500;
/**
 * Events that only record identity or membership. They are left out of
 * activity: the browser SDK sends `$group` on every page load that calls group().
 */
const BOOKKEEPING_EVENTS_SQL = `('$group', '$identify', '$alias')`;

/**
 * Groups are the accounts or organizations the SDKs' `group()` call reports
 * (`$group` events with `properties.organizationId` and `traits`). Like error
 * issues they are derived from events when read, so nothing is stored at ingest:
 *
 * - a group's traits are those of its most recent `$group` event that had any;
 * - its members are the people (user id, else anonymous id) who sent a `$group`
 *   event for it;
 * - its activity is every other event those members sent in the window. A
 *   person in two groups counts toward both.
 */
const GROUP_EVENTS_CTE = `
  group_events AS (
    SELECT e.properties->>'organizationId' AS key,
      COALESCE(e.user_id, e.anonymous_id) AS actor,
      e.properties->'traits' AS traits,
      e.occurred_at
    FROM events e
    WHERE e.project_id = $1 AND e.event_name = '${GROUP_EVENT}'
      AND NULLIF(e.properties->>'organizationId', '') IS NOT NULL
  ),
  groups AS (
    SELECT key,
      (array_agg(traits ORDER BY occurred_at DESC)
        FILTER (WHERE jsonb_typeof(traits) = 'object' AND traits <> '{}'::jsonb))[1] AS traits,
      min(occurred_at) AS "firstSeen",
      max(occurred_at) AS "lastSeen",
      count(DISTINCT actor)::int AS members
    FROM group_events GROUP BY key
  ),
  members AS (
    SELECT key, actor, min(occurred_at) AS "joinedAt"
    FROM group_events WHERE actor IS NOT NULL GROUP BY key, actor
  )`;

/** Member activity in the window; `$2` is the number of days. */
const ACTIVITY_SOURCE = `
  FROM events e
  JOIN members m ON m.actor = COALESCE(e.user_id, e.anonymous_id)
  WHERE e.project_id = $1 AND e.occurred_at >= now() - make_interval(days => $2::int)
    AND e.event_name NOT IN ${BOOKKEEPING_EVENTS_SQL}`;

export interface GroupSummary {
  key: string;
  name: string;
  traits: Record<string, string | number | boolean>;
  members: number;
  activeMembers: number;
  events: number;
  firstSeen: string;
  lastSeen: string;
  lastActiveAt: string | null;
}

type GroupRow = {
  key: string;
  traits: Record<string, unknown> | null;
  members: number;
  activeMembers: number | null;
  events: number | null;
  firstSeen: string;
  lastSeen: string;
  lastActiveAt: string | null;
};

type MemberRow = {
  actor: string;
  userId: string | null;
  externalId: string | null;
  anonymousId: string | null;
  traits: Record<string, unknown> | null;
  joinedAt: string;
  events: number | null;
  lastActiveAt: string | null;
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  /** Groups with their member activity in the last `days`, most active first. */
  async listGroups(user: DashboardUser, params: { days?: string; search?: string; projectId?: string }) {
    const project = await this.projects.resolveActiveProject(user, params.projectId);
    const days = this.clampDays(params.days);
    const search = params.search?.trim() ? params.search.trim().slice(0, 100) : null;
    if (!project) return { project: null, days, groups: [] as GroupSummary[], total: 0 };

    const result = await this.database.query<GroupRow & { total: number }>(
      `WITH ${GROUP_EVENTS_CTE},
        activity AS (
          SELECT m.key, count(*)::int AS events, count(DISTINCT m.actor)::int AS "activeMembers",
            max(e.occurred_at) AS "lastActiveAt"
          ${ACTIVITY_SOURCE}
          GROUP BY m.key
        )
       SELECT g.key, g.traits, g.members, g."firstSeen", g."lastSeen",
         a.events, a."activeMembers", a."lastActiveAt",
         count(*) OVER ()::int AS total
       FROM groups g
       LEFT JOIN activity a ON a.key = g.key
       WHERE $3::text IS NULL
         OR g.key ILIKE '%' || $3 || '%'
         OR g.traits->>'name' ILIKE '%' || $3 || '%'
       ORDER BY COALESCE(a.events, 0) DESC, g."lastSeen" DESC
       LIMIT ${MAX_GROUPS}`,
      [project.id, days, search]
    );

    return {
      project,
      days,
      groups: result.rows.map((row) => this.toSummary(row)),
      total: result.rows[0]?.total ?? 0
    };
  }

  /** One group: traits, members with their activity, daily activity and top events. */
  async getGroup(user: DashboardUser, keyParam: string, params: { days?: string; projectId?: string }) {
    const key = typeof keyParam === 'string' ? keyParam.trim() : '';
    if (!key || key.length > MAX_KEY_LENGTH) throw new BadRequestException('A group id is required.');
    const project = await this.projects.requireActiveProject(user, params.projectId);
    const days = this.clampDays(params.days);
    // $3 limits every CTE below to this group.
    const values = [project.id, days, key];
    const groupEvents = GROUP_EVENTS_CTE.replace(
      `AND NULLIF(e.properties->>'organizationId', '') IS NOT NULL`,
      `AND e.properties->>'organizationId' = $3`
    );

    const group = await this.database.query<GroupRow>(
      `WITH ${groupEvents},
        activity AS (
          SELECT count(*)::int AS events, count(DISTINCT m.actor)::int AS "activeMembers",
            max(e.occurred_at) AS "lastActiveAt"
          ${ACTIVITY_SOURCE}
        )
       SELECT g.key, g.traits, g.members, g."firstSeen", g."lastSeen", a.events, a."activeMembers", a."lastActiveAt"
       FROM groups g CROSS JOIN activity a`,
      values
    );
    const row = group.rows[0];
    if (!row) throw new NotFoundException('No group with this id has been reported in this project.');

    const members = await this.database.query<MemberRow>(
      `WITH ${groupEvents},
        activity AS (
          SELECT m.actor, count(*)::int AS events, max(e.occurred_at) AS "lastActiveAt"
          ${ACTIVITY_SOURCE}
          GROUP BY m.actor
        )
       SELECT m.actor, u.id AS "userId", u.external_id AS "externalId", u.anonymous_id AS "anonymousId", u.traits,
         m."joinedAt", a.events, a."lastActiveAt"
       FROM members m
       LEFT JOIN activity a ON a.actor = m.actor
       LEFT JOIN users u ON u.project_id = $1 AND u.id = m.actor
       ORDER BY COALESCE(a.events, 0) DESC, m."joinedAt" ASC
       LIMIT ${MAX_MEMBERS}`,
      values
    );

    const daily = await this.database.query<{ day: string; events: number; activeMembers: number }>(
      `WITH ${groupEvents}
       SELECT to_char(date_trunc('day', e.occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
         count(*)::int AS events, count(DISTINCT m.actor)::int AS "activeMembers"
       ${ACTIVITY_SOURCE}
       GROUP BY 1 ORDER BY 1`,
      values
    );
    const byDay = new Map(daily.rows.map((d) => [d.day, d]));
    const timeline = this.dayBuckets(days).map((day) => ({
      day,
      events: byDay.get(day)?.events ?? 0,
      activeMembers: byDay.get(day)?.activeMembers ?? 0
    }));

    const topEvents = await this.database.query<{ name: string; total: number }>(
      `WITH ${groupEvents}
       SELECT e.event_name AS name, count(*)::int AS total
       ${ACTIVITY_SOURCE}
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      values
    );

    return {
      project,
      days,
      group: { ...this.toSummary(row), allTraits: row.traits ?? {} },
      members: members.rows.map((member) => ({
        id: member.actor,
        userId: member.userId,
        displayName: resolveDisplayName(member.traits, member.externalId, member.anonymousId ?? member.actor, member.userId ?? member.actor),
        externalId: member.externalId,
        email: typeof member.traits?.email === 'string' ? member.traits.email : null,
        joinedAt: member.joinedAt,
        events: member.events ?? 0,
        lastActiveAt: member.lastActiveAt
      })),
      timeline,
      topEvents: topEvents.rows
    };
  }

  private toSummary(row: GroupRow): GroupSummary {
    const traits = row.traits ?? {};
    const name = typeof traits.name === 'string' && traits.name.trim() ? traits.name.trim() : row.key;
    return {
      key: row.key,
      name,
      traits: sanitizeTraitsPreview(traits),
      members: row.members,
      activeMembers: row.activeMembers ?? 0,
      events: row.events ?? 0,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      lastActiveAt: row.lastActiveAt ?? null
    };
  }

  private clampDays(value?: string): number {
    const parsed = Number(value);
    return DAY_OPTIONS.includes(parsed) ? parsed : DEFAULT_DAYS;
  }

  private dayBuckets(days: number): string[] {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(today.getTime() - (days - 1 - index) * 86_400_000);
      return day.toISOString().slice(0, 10);
    });
  }
}

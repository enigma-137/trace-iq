import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface AdminOverview {
  [column: string]: unknown;
  organizations: number;
  projects: number;
  eventsTotal: number;
  events24h: number;
  activeOrgs24h: number;
  trackedUsers: number;
}

export interface AdminOrganization {
  [column: string]: unknown;
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  projectCount: number;
  eventCount: number;
  createdAt: string;
}

export interface AdminProject {
  [column: string]: unknown;
  id: string;
  name: string;
  slug: string;
  organizationName: string;
  eventCount: number;
  lastEventAt: string | null;
  createdAt: string;
}

export interface AdminActivityItem {
  [column: string]: unknown;
  id: string;
  eventName: string;
  projectName: string;
  organizationName: string;
  occurredAt: string;
  path: string | null;
  country: string | null;
  device: string | null;
}

export interface AdminLogEntry {
  [column: string]: unknown;
  kind: 'alert' | 'digest' | 'achievement' | 'audit';
  summary: string;
  occurredAt: string;
}

export interface AdminTimelinePoint {
  [column: string]: unknown;
  day: string;
  total: number;
}

const OVERVIEW_SQL = `
  SELECT
    (SELECT COUNT(*)::int FROM organizations) AS "organizations",
    (SELECT COUNT(*)::int FROM projects) AS "projects",
    (SELECT COUNT(*)::int FROM events) AS "eventsTotal",
    (SELECT COUNT(*)::int FROM events WHERE received_at >= now() - interval '24 hours') AS "events24h",
    (SELECT COUNT(DISTINCT organization_id)::int FROM events
      WHERE received_at >= now() - interval '24 hours') AS "activeOrgs24h",
    (SELECT COUNT(*)::int FROM users) AS "trackedUsers"
`;

const ORGANIZATIONS_SQL = `
  SELECT
    o.id,
    o.name,
    o.slug,
    o.created_at AS "createdAt",
    (SELECT COUNT(*)::int FROM organization_members m
      WHERE m.organization_id = o.id) AS "memberCount",
    (SELECT COUNT(*)::int FROM projects p
      WHERE p.organization_id = o.id) AS "projectCount",
    (SELECT COUNT(*)::int FROM events e
      WHERE e.organization_id = o.id) AS "eventCount"
  FROM organizations o
  ORDER BY o.created_at DESC
  LIMIT 200
`;

const PROJECTS_SQL = `
  SELECT
    p.id,
    p.name,
    p.slug,
    o.name AS "organizationName",
    p.created_at AS "createdAt",
    (SELECT COUNT(*)::int FROM events e
      WHERE e.project_id = p.id) AS "eventCount",
    (SELECT MAX(e.received_at)::text FROM events e
      WHERE e.project_id = p.id) AS "lastEventAt"
  FROM projects p
  JOIN organizations o ON o.id = p.organization_id
  ORDER BY p.created_at DESC
  LIMIT 200
`;

const ACTIVITY_SQL = `
  SELECT
    e.id,
    e.event_name AS "eventName",
    p.name AS "projectName",
    o.name AS "organizationName",
    e.occurred_at AS "occurredAt",
    e.properties->>'path' AS path,
    e.network_info->>'country' AS country,
    e.device_info->>'type' AS device
  FROM events e
  JOIN projects p ON p.id = e.project_id
  JOIN organizations o ON o.id = p.organization_id
  ORDER BY e.received_at DESC
  LIMIT 50
`;

// Unified "system log" stream: alert deliveries, monthly digests, achievement
// unlock emails and org audit events, newest first. The dashboard renders it as
// a single chronological feed so the operator can see what the platform is doing.
const LOGS_SQL = `
  SELECT kind, summary, occurred_at AS "occurredAt"
  FROM (
    SELECT
      'alert'::text AS kind,
      ('Alert "' || a.name || '" → ' || COALESCE(ad.recipient, 'group') || ' [' || ad.status || ']') AS summary,
      ad.sent_at AS occurred_at
    FROM alert_deliveries ad
    JOIN alerts a ON a.id = ad.alert_id
    WHERE ad.sent_at IS NOT NULL

    UNION ALL

    SELECT
      'digest'::text AS kind,
      ('Monthly digest sent to ' || o.name) AS summary,
      ds.sent_at AS occurred_at
    FROM email_digest_sends ds
    JOIN organizations o ON o.id = ds.organization_id

    UNION ALL

    SELECT
      'achievement'::text AS kind,
      ('Achievement "' || a.title || '" unlock email sent') AS summary,
      u.email_sent_at AS occurred_at
    FROM achievement_unlocks u
    JOIN achievements a ON a.id = u.achievement_id
    WHERE u.email_sent_at IS NOT NULL

    UNION ALL

    SELECT
      'audit'::text AS kind,
      (e.action || CASE WHEN e.target_email IS NOT NULL THEN ' → ' || e.target_email ELSE '' END) AS summary,
      e.created_at AS occurred_at
    FROM organization_audit_events e
  ) feed
  ORDER BY occurred_at DESC
  LIMIT 100
`;

// Daily event volume over the last 14 days, so the operator can spot trends at
// a glance. Buckets are UTC calendar days (matches the rest of the platform).
const TIMELINE_SQL = `
  SELECT to_char(date_trunc('day', received_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS total
  FROM events
  WHERE received_at >= now() - interval '14 days'
  GROUP BY date_trunc('day', received_at)
  ORDER BY date_trunc('day', received_at) ASC
`;

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService) {}

  async overview(): Promise<AdminOverview> {
    const result = await this.database.query<AdminOverview>(OVERVIEW_SQL);
    return result.rows[0];
  }

  async organizations(): Promise<AdminOrganization[]> {
    const result = await this.database.query<AdminOrganization>(ORGANIZATIONS_SQL);
    return result.rows;
  }

  async projects(): Promise<AdminProject[]> {
    const result = await this.database.query<AdminProject>(PROJECTS_SQL);
    return result.rows;
  }

  async activity(): Promise<AdminActivityItem[]> {
    const result = await this.database.query<AdminActivityItem>(ACTIVITY_SQL);
    return result.rows;
  }

  async logs(): Promise<AdminLogEntry[]> {
    const result = await this.database.query<AdminLogEntry>(LOGS_SQL);
    return result.rows;
  }

  async timeline(): Promise<AdminTimelinePoint[]> {
    const result = await this.database.query<AdminTimelinePoint>(TIMELINE_SQL);
    return result.rows;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { EmailService, toUniqueEmails } from '../emails/email.service';

export interface DigestProjectRow {
  [column: string]: unknown;
  id: string;
  name: string;
  events: number;
  previousEvents: number;
  users: number;
  sessions: number;
  revenue: number;
  previousRevenue: number;
  transactions: number;
  topEvent: string | null;
  topCountry: string | null;
}

export interface DigestPayload {
  organization: { id: string; name: string };
  period: string;
  generatedAt: string;
  projects: DigestProjectRow[];
}

// Month period string for a given Date, e.g. '2026-08'.
export function periodString(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService
  ) {}

  /**
   * Collects the monthly stats used by the digest for every project in one
   * organization. Windows are calendar months (UTC) rather than rolling days so
   * a "monthly report" reads the way people expect.
   */
  async collectForOrganization(organizationId: string, period: string): Promise<DigestPayload> {
    const [year, month] = period.split('-').map((part) => Number(part));
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const prevEnd = start;
    const prevStart = new Date(Date.UTC(year, month - 2, 1));

    const orgResult = await this.database.query<{ id: string; name: string }>(
      `SELECT id, name FROM organizations WHERE id = $1`,
      [organizationId]
    );

    const projectsResult = await this.database.query<DigestProjectRow>(
      `
        SELECT
          p.id,
          p.name,
          count(*) FILTER (WHERE e.occurred_at >= $2 AND e.occurred_at < $3)::int AS events,
          count(*) FILTER (WHERE e.occurred_at >= $4 AND e.occurred_at < $5)::int AS "previousEvents",
          count(DISTINCT COALESCE(e.user_id::text, e.anonymous_id)) FILTER (WHERE e.occurred_at >= $2 AND e.occurred_at < $3)::int AS users,
          count(DISTINCT e.session_id) FILTER (WHERE e.occurred_at >= $2 AND e.occurred_at < $3)::int AS sessions,
          COALESCE(sum(CASE
            WHEN e.occurred_at >= $2 AND e.occurred_at < $3
                 AND e.properties->>'amount' ~ '^-?[0-9]+(\\.[0-9]+)?$'
            THEN (e.properties->>'amount')::numeric
          END), 0)::float AS revenue,
          COALESCE(sum(CASE
            WHEN e.occurred_at >= $4 AND e.occurred_at < $5
                 AND e.properties->>'amount' ~ '^-?[0-9]+(\\.[0-9]+)?$'
            THEN (e.properties->>'amount')::numeric
          END), 0)::float AS "previousRevenue",
          count(CASE
            WHEN e.occurred_at >= $2 AND e.occurred_at < $3
                 AND e.properties->>'amount' ~ '^-?[0-9]+(\\.[0-9]+)?$'
            THEN 1
          END)::int AS transactions
        FROM projects p
        LEFT JOIN events e ON e.project_id = p.id
        WHERE p.organization_id = $1
        GROUP BY p.id, p.name
        ORDER BY p.created_at ASC
      `,
      [organizationId, start.toISOString(), end.toISOString(), prevStart.toISOString(), prevEnd.toISOString()]
    );

    const projects = projectsResult.rows;

    const projectIds = projects.map((row) => row.id);
    const topFacts = projectIds.length > 0
      ? await this.topFactsForProjects(projectIds, start.toISOString(), end.toISOString())
      : new Map<string, { event: string | null; country: string | null }>();

    const enriched = projects.map((row) => {
      const facts = topFacts.get(row.id);
      return { ...row, topEvent: facts?.event ?? null, topCountry: facts?.country ?? null };
    });

    return {
      organization: orgResult.rows[0] ?? { id: organizationId, name: organizationId },
      period,
      generatedAt: new Date().toISOString(),
      projects: enriched
    };
  }

  /**
   * Sends a digest to every organization member with a cached email that has NOT
   * already received one for this period. Records each successful send so a
   * re-run is a no-op. Returns the number of organizations emailed.
   */
  async sendDueDigests(period: string = periodString()): Promise<{ sent: number }> {
    if (!this.email.configured) {
      this.logger.warn('Email digests skipped: RESEND_API_KEY not configured.');
      return { sent: 0 };
    }

    const due = await this.database.query<{ organization_id: string; organization_name: string }>(
      `
        SELECT DISTINCT
          o.id AS organization_id,
          o.name AS organization_name
        FROM organizations o
        JOIN projects p ON p.organization_id = o.id
        JOIN organization_members m ON m.organization_id = o.id
        WHERE m.email IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM events e WHERE e.project_id = p.id AND e.occurred_at >= $2::timestamptz AND e.occurred_at < $3::timestamptz
          )
          AND NOT EXISTS (
            SELECT 1 FROM email_digest_sends d WHERE d.organization_id = o.id AND d.period = $1
          )
      `,
      [period, `${period}-01T00:00:00.000Z`, this.nextPeriodStart(period)]
    );

    let sent = 0;
    for (const org of due.rows) {
      try {
        await this.sendForOrganization(org.organization_id, period);
        sent += 1;
      } catch (error) {
        this.logger.error(`Digest failed for ${org.organization_id}`, error instanceof Error ? error.stack : error);
      }
    }

    return { sent };
  }

  /**
   * Builds the digest for one organization and emails every member with a
   * cached email address. Marks the send so `sendDueDigests` skips it next time.
   */
  async sendForOrganization(organizationId: string, period: string = periodString()): Promise<void> {
    const payload = await this.collectForOrganization(organizationId, period);
    const recipients = await this.memberEmails(organizationId);
    if (recipients.length === 0) {
      return;
    }

    const subject = `${this.periodLabel(payload.period)} summary — ${payload.organization.name}`;
    const result = await this.email.send({
      to: recipients,
      subject,
      html: buildDigestEmail(payload)
    });

    if (!result.ok) {
      // Leave unrecorded so the next scheduled run retries.
      throw new Error(`Resend failed for ${organizationId}: ${result.failure ?? 'unknown'}`);
    }

    await this.recordSent(organizationId, period);
  }

  private async memberEmails(organizationId: string): Promise<string[]> {
    const result = await this.database.query<{ email: string | null }>(
      `SELECT email FROM organization_members WHERE organization_id = $1 AND email IS NOT NULL`,
      [organizationId]
    );
    return toUniqueEmails(result.rows.map((row) => row.email ?? ''));
  }

  private async recordSent(organizationId: string, period: string): Promise<void> {
    await this.database.query(
      `INSERT INTO email_digest_sends (organization_id, period, sent_at)
       VALUES ($1, $2, now())
       ON CONFLICT (organization_id, period) DO NOTHING`,
      [organizationId, period]
    );
  }

  private async topFactsForProjects(
    projectIds: string[],
    fromIso: string,
    toIso: string
  ): Promise<Map<string, { event: string | null; country: string | null }>> {
    const map = new Map<string, { event: string | null; country: string | null }>();

    const events = await this.database.query<{ project_id: string; name: string }>(
      `
        SELECT project_id, name FROM (
          SELECT project_id,
            event_name AS name,
            row_number() OVER (PARTITION BY project_id ORDER BY count(*) DESC, event_name ASC) AS rn
          FROM events
          WHERE project_id = ANY($1) AND occurred_at >= $2 AND occurred_at < $3
          GROUP BY project_id, event_name
        ) ranked
        WHERE rn = 1
      `,
      [projectIds, fromIso, toIso]
    );
    for (const row of events.rows) {
      map.set(row.project_id, { event: row.name, country: null });
    }

    const countries = await this.database.query<{ project_id: string; name: string }>(
      `
        SELECT project_id, name FROM (
          SELECT project_id,
            network_info->>'country' AS name,
            row_number() OVER (PARTITION BY project_id ORDER BY count(*) DESC, network_info->>'country' ASC) AS rn
          FROM events
          WHERE project_id = ANY($1) AND occurred_at >= $2 AND occurred_at < $3
            AND NULLIF(network_info->>'country', '') IS NOT NULL
            AND network_info->>'country' != 'unknown'
          GROUP BY project_id, network_info->>'country'
        ) ranked
        WHERE rn = 1
      `,
      [projectIds, fromIso, toIso]
    );
    for (const row of countries.rows) {
      const existing = map.get(row.project_id) ?? { event: null, country: null };
      existing.country = row.name;
      map.set(row.project_id, existing);
    }

    return map;
  }

  private periodLabel(period: string): string {
    const [year, month] = period.split('-').map((part) => Number(part));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[month - 1] ?? month} ${year}`;
  }

  private nextPeriodStart(period: string): string {
    const [year, month] = period.split('-').map((part) => Number(part));
    const next = new Date(Date.UTC(year, month, 1));
    return next.toISOString();
  }
}

export function buildDigestEmail(payload: DigestPayload): string {
  const dashboardBaseUrl = (process.env.DASHBOARD_URL ?? 'https://traceiq.run')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/dashboard$/, '');
  const dashboardUrl = `${dashboardBaseUrl}/dashboard`;

  const projectsHtml = payload.projects
    .map((project) => {
      const delta = project.previousEvents > 0
        ? Math.round(((project.events - project.previousEvents) / project.previousEvents) * 100)
        : project.events > 0 ? null : 0;
      const revenue = project.revenue > 0 ? formatMoney(project.revenue) : 'n/a';
      const eventLine = project.events === 0
        ? 'No events this month. The SDK is either not installed or was quiet.'
        : `${project.events.toLocaleString()} events · ${project.users.toLocaleString()} users · ${project.sessions.toLocaleString()} sessions · ${revenue} revenue`;

      return `
        <div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div style="font-weight:700;font-size:15px;color:#0f172a;">${escapeHtml(project.name)}</div>
            <div style="font-size:12px;color:#64748b;">${delta === null ? 'new this month' : delta === 0 ? 'flat vs last month' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last month`}</div>
          </div>
          <div style="font-size:14px;color:#334155;margin-top:6px;line-height:1.6;">${eventLine}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Top event: ${escapeHtml(project.topEvent ?? '—')} · Top location: ${escapeHtml(project.topCountry ?? '—')}</div>
        </div>`;
    })
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a;">
      <div style="padding:20px 0;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:13px;color:#94a3b8;">TraceIQ · monthly digest</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">Your ${payload.period.split('-').join('-')} summary</div>
        <div style="font-size:14px;color:#475569;margin-top:6px;">${escapeHtml(payload.organization.name)}</div>
      </div>
      ${projectsHtml}
      <p style="margin-top:20px;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#4169e1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">Open dashboard</a>
      </p>
      <p style="font-size:13px;color:#94a3b8;margin-top:20px;">TraceIQ · traceiq.run</p>
    </div>`;
}

function formatMoney(value: number): string {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return formatter.format(value);
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
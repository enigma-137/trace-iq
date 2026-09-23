import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { EntitlementService } from '../billing/entitlement.service';
import { EmailService, isValidEmail } from '../emails/email.service';
import { ProjectsService } from '../projects/projects.service';

export interface ExportEventsQuery {
  projectId?: string;
  from?: string;
  to?: string;
  event?: string;
  limit?: string | number;
}

export interface EmailExportDto extends ExportEventsQuery {
  format?: 'csv' | 'json';
  recipientEmail?: string;
}

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 50_000;
const DEFAULT_WINDOW_DAYS = 30;

const COLUMNS: Array<string> = [
  'id',
  'occurredAt',
  'eventName',
  'distinctId',
  'userId',
  'anonymousId',
  'sessionId',
  'country',
  'region',
  'city',
  'os',
  'deviceType',
  'browser'
];

@Injectable()
export class ExportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    @Optional() private readonly entitlements: EntitlementService = new EntitlementService(database),
    @Optional() private readonly email: EmailService = new EmailService()
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

  async emailExport(user: DashboardUser, dto: EmailExportDto) {
    const project = await this.projects.requireActiveProject(user, dto.projectId);

    // Entitlement verification: email export is available on Pro or self-hosted
    const snapshot = await this.entitlements.getSnapshot(project.organizationId);
    if (snapshot.deploymentMode === 'cloud' && snapshot.plan === 'free') {
      throw new ForbiddenException({
        code: 'ENTITLEMENT_REQUIRED',
        resource: 'exports:email',
        plan: 'free',
        message: 'Email export delivery is available on TraceIQ Pro.'
      });
    }

    const recipient = (dto.recipientEmail?.trim() || user.email || '').trim().toLowerCase();
    if (!recipient || !isValidEmail(recipient)) {
      throw new BadRequestException('A valid recipient email address is required.');
    }

    const format = dto.format === 'json' ? 'json' : 'csv';
    const exportData = await this.exportEvents(user, dto);

    const fromFormatted = exportData.from.slice(0, 10);
    const toFormatted = exportData.to.slice(0, 10);
    const sanitizedName = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `traceiq-events_${sanitizedName}_${fromFormatted}_to_${toFormatted}.${format}`;

    const contentString =
      format === 'json'
        ? JSON.stringify(exportData.events, null, 2)
        : formatExportCsv(exportData.events);

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0;">TraceIQ Event Export</h2>
          <p style="font-size: 14px; color: #64748b; margin: 0;">Your requested raw event export from <strong>${escapeHtml(project.name)}</strong> is ready.</p>
        </div>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Project:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${escapeHtml(project.name)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Date Range:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${fromFormatted} to ${toFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Event Filter:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${exportData.event ? escapeHtml(exportData.event) : 'All events'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Format:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${format.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Total Events:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${exportData.count.toLocaleString()}</td>
            </tr>
          </table>
        </div>

        ${exportData.truncated ? `<p style="font-size: 12px; color: #b45309; background-color: #fef3c7; padding: 8px 12px; border-radius: 4px; margin-bottom: 20px;">⚠️ Export reached the ${exportData.limit.toLocaleString()} row cap. Narrow the date range to retrieve remaining records.</p>` : ''}

        <p style="font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 24px;">
          The complete dataset has been attached to this email as <code>${filename}</code>.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
        <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">
          Sent from TraceIQ Product Analytics · <a href="https://traceiq.run" style="color: #2563eb; text-decoration: none;">traceiq.run</a>
        </p>
      </div>
    `;

    if (!this.email.configured) {
      return {
        ok: true,
        simulated: true,
        project: exportData.project,
        recipient,
        format,
        filename,
        count: exportData.count,
        truncated: exportData.truncated,
        message: `Export of ${exportData.count.toLocaleString()} events prepared (Email delivery simulated: RESEND_API_KEY not configured).`
      };
    }

    const emailResult = await this.email.send({
      to: [recipient],
      subject: `Your TraceIQ Event Export — ${project.name} (${exportData.count.toLocaleString()} events)`,
      html: htmlBody,
      attachments: [
        {
          filename,
          content: Buffer.from(contentString, 'utf-8'),
          contentType: format === 'json' ? 'application/json' : 'text/csv'
        }
      ]
    });

    if (!emailResult.ok) {
      throw new BadRequestException(`Failed to dispatch export email: ${emailResult.failure}`);
    }

    return {
      ok: true,
      simulated: false,
      project: exportData.project,
      recipient,
      format,
      filename,
      count: exportData.count,
      truncated: exportData.truncated,
      message: `Export containing ${exportData.count.toLocaleString()} events sent to ${recipient}.`
    };
  }
}

function formatExportCsv(events: Record<string, unknown>[]): string {
  const header = [...COLUMNS, 'properties'];
  const lines = [header.map(csvCell).join(',')];
  for (const ev of events) {
    const row = COLUMNS.map((col) => csvCell(ev[col]));
    row.push(csvCell(ev.properties ? JSON.stringify(ev.properties) : ''));
    lines.push(row.join(','));
  }
  return lines.join('\r\n');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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


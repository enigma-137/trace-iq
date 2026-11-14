import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { EmailService } from '../emails/email.service';

export const CARD_REQUEST_MIN_LENGTH = 5;
export const CARD_REQUEST_MAX_LENGTH = 1000;
/** Enough for anyone with real ideas, not enough to flood the inbox. */
export const CARD_REQUESTS_PER_DAY = 5;

const DEFAULT_INBOX = 'traceiq.run@gmail.com';

export interface CardRequestResponse {
  id: string;
  createdAt: string;
}

/**
 * Requests for Overview cards that don't exist yet. Each one is stored (so the team can
 * count what's wanted) and emailed to the TraceIQ inbox. A failed email never loses the
 * request: it's already in the table.
 */
@Injectable()
export class CardRequestsService {
  private readonly logger = new Logger(CardRequestsService.name);
  private readonly inbox = process.env.CARD_REQUESTS_EMAIL || DEFAULT_INBOX;

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly email: EmailService
  ) {}

  async create(user: DashboardUser, body: { request?: unknown; projectId?: unknown }): Promise<CardRequestResponse> {
    const request = typeof body.request === 'string' ? body.request.trim() : '';
    if (request.length < CARD_REQUEST_MIN_LENGTH) {
      throw new BadRequestException('Tell us a little about the card you want.');
    }
    if (request.length > CARD_REQUEST_MAX_LENGTH) {
      throw new BadRequestException(`Keep it under ${CARD_REQUEST_MAX_LENGTH} characters.`);
    }

    const recent = await this.database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM card_requests WHERE user_id = $1 AND created_at >= now() - interval '1 day'`,
      [user.id]
    );
    if ((recent.rows[0]?.count ?? 0) >= CARD_REQUESTS_PER_DAY) {
      throw new HttpException(
        `You've sent ${CARD_REQUESTS_PER_DAY} requests today. Try again tomorrow, or email ${this.inbox}.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // The project is context for the team, not a requirement: a request still goes in without one.
    const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : undefined;
    const project = await this.projects.resolveActiveProject(user, projectId).catch(() => null);

    const id = `crq_${randomUUID()}`;
    const inserted = await this.database.query<{ created_at: string | Date }>(
      `
        INSERT INTO card_requests (id, user_id, user_email, organization_id, project_id, request)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING created_at
      `,
      [id, user.id, user.email ?? null, project?.organizationId ?? null, project?.id ?? null, request]
    );
    const createdAt = new Date(inserted.rows[0]?.created_at ?? Date.now()).toISOString();

    const sent = await this.email.send({
      to: [this.inbox],
      subject: `Overview card request: ${request.split('\n')[0].slice(0, 60)}`,
      html: cardRequestEmail({
        request,
        from: user.email ?? user.id,
        project: project ? `${project.name} (${project.organizationName})` : null,
        id
      }),
      idempotencyKey: id
    });
    if (!sent.ok) this.logger.warn(`Card request ${id} stored but not emailed: ${sent.failure}`);

    return { id, createdAt };
  }
}

export function cardRequestEmail(args: { request: string; from: string; project: string | null; id: string }): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">${label}</td><td style="padding:4px 0;font-size:13px;color:#0f172a;">${escapeHtml(value)}</td></tr>`;
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#0f172a;">New Overview card request</h2>
      <p style="white-space:pre-wrap;font-size:14px;line-height:1.5;color:#0f172a;border-left:3px solid #e2e8f0;padding-left:12px;margin:0 0 16px;">${escapeHtml(args.request)}</p>
      <table style="border-collapse:collapse;">
        ${row('From', args.from)}
        ${args.project ? row('Project', args.project) : ''}
        ${row('Request id', args.id)}
      </table>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

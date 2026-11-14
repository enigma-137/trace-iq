import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export const FEEDBACK_KINDS = ['card_request', 'idea', 'problem', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_STATUSES = ['new', 'planned', 'done', 'declined'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MIN_LENGTH = 5;
export const FEEDBACK_MAX_LENGTH = 2000;
/** Plenty for real feedback, not enough to flood the inbox. */
export const FEEDBACK_PER_DAY = 10;

export interface FeedbackCreated {
  id: string;
  createdAt: string;
}

export interface FeedbackItem {
  [column: string]: unknown;
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  userEmail: string | null;
  organizationName: string | null;
  projectName: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface FeedbackInbox {
  items: FeedbackItem[];
  unread: number;
  total: number;
}

/**
 * What people send the TraceIQ team from inside the product: card requests from the
 * Overview's + menu and feedback from the dashboard header. The platform admin console
 * reads it as an inbox. Nothing is emailed; the admin bell shows what's unread.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async create(
    user: DashboardUser,
    body: { kind?: unknown; message?: unknown; projectId?: unknown; page?: unknown }
  ): Promise<FeedbackCreated> {
    const kind = FEEDBACK_KINDS.includes(body.kind as FeedbackKind) ? (body.kind as FeedbackKind) : 'other';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < FEEDBACK_MIN_LENGTH) {
      throw new BadRequestException(kind === 'card_request' ? 'Tell us a little about the card you want.' : 'Tell us a little more.');
    }
    if (message.length > FEEDBACK_MAX_LENGTH) {
      throw new BadRequestException(`Keep it under ${FEEDBACK_MAX_LENGTH} characters.`);
    }

    const recent = await this.database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM feedback WHERE user_id = $1 AND created_at >= now() - interval '1 day'`,
      [user.id]
    );
    if ((recent.rows[0]?.count ?? 0) >= FEEDBACK_PER_DAY) {
      throw new HttpException(`You've sent ${FEEDBACK_PER_DAY} messages today. Try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    // The project is context for the team, not a requirement.
    const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : undefined;
    const project = await this.projects.resolveActiveProject(user, projectId).catch(() => null);
    const page = typeof body.page === 'string' && body.page.startsWith('/') ? body.page.slice(0, 200) : null;

    const id = `fb_${randomUUID()}`;
    const inserted = await this.database.query<{ created_at: string | Date }>(
      `
        INSERT INTO feedback (id, kind, user_id, user_email, organization_id, project_id, message, page)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING created_at
      `,
      [id, kind, user.id, user.email ?? null, project?.organizationId ?? null, project?.id ?? null, message, page]
    );
    return { id, createdAt: new Date(inserted.rows[0]?.created_at ?? Date.now()).toISOString() };
  }

  /** The admin inbox, newest first, optionally only unread or one kind. */
  async inbox(filters: { unread?: boolean; kind?: string; limit?: number } = {}): Promise<FeedbackInbox> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters.unread) conditions.push('f.read_at IS NULL');
    if (filters.kind && FEEDBACK_KINDS.includes(filters.kind as FeedbackKind)) {
      values.push(filters.kind);
      conditions.push(`f.kind = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), 200);

    const [items, counts] = await Promise.all([
      this.database.query<FeedbackItem>(
        `
          SELECT
            f.id, f.kind, f.message, f.page, f.status,
            f.user_email AS "userEmail",
            o.name AS "organizationName",
            p.name AS "projectName",
            f.read_at AS "readAt",
            f.created_at AS "createdAt"
          FROM feedback f
          LEFT JOIN organizations o ON o.id = f.organization_id
          LEFT JOIN projects p ON p.id = f.project_id
          ${where}
          ORDER BY f.created_at DESC
          LIMIT ${limit}
        `,
        values
      ),
      this.database.query<{ unread: number; total: number }>(
        `SELECT count(*) FILTER (WHERE read_at IS NULL)::int AS unread, count(*)::int AS total FROM feedback`
      )
    ]);
    return { items: items.rows, unread: counts.rows[0]?.unread ?? 0, total: counts.rows[0]?.total ?? 0 };
  }

  async unreadCount(): Promise<{ unread: number }> {
    const result = await this.database.query<{ unread: number }>(
      `SELECT count(*)::int AS unread FROM feedback WHERE read_at IS NULL`
    );
    return { unread: result.rows[0]?.unread ?? 0 };
  }

  /** Mark one item read or unread, and/or move it through new → planned → done/declined. */
  async update(id: string, body: { read?: unknown; status?: unknown }): Promise<{ id: string; status: FeedbackStatus; readAt: string | null }> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (typeof body.read === 'boolean') sets.push(`read_at = ${body.read ? 'COALESCE(read_at, now())' : 'NULL'}`);
    if (body.status !== undefined) {
      if (!FEEDBACK_STATUSES.includes(body.status as FeedbackStatus)) {
        throw new BadRequestException(`Status must be one of ${FEEDBACK_STATUSES.join(', ')}.`);
      }
      values.push(body.status);
      sets.push(`status = $${values.length}`);
      // Triaging something means it has been seen.
      if (typeof body.read !== 'boolean') sets.push('read_at = COALESCE(read_at, now())');
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to update.');

    const result = await this.database.query<{ id: string; status: FeedbackStatus; read_at: string | Date | null }>(
      `UPDATE feedback SET ${sets.join(', ')} WHERE id = $1 RETURNING id, status, read_at`,
      values
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Feedback not found.');
    return { id: row.id, status: row.status, readAt: row.read_at ? new Date(row.read_at).toISOString() : null };
  }

  async markAllRead(): Promise<{ updated: number }> {
    const result = await this.database.query(`UPDATE feedback SET read_at = now() WHERE read_at IS NULL`);
    return { updated: result.rowCount ?? 0 };
  }
}

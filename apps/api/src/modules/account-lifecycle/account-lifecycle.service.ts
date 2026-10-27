import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../emails/email.service';
import { ReplayService } from '../replay/replay.service';

const DELETION_GRACE_DAYS = 30;
const MAX_EXPORT_ROWS = 50_000;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const SENSITIVE_FIELD = /(secret|token|password|credential|private.?key|api.?key|key.?hash|authorization)/i;

interface LifecycleRequestRow extends QueryResultRow {
  id: string;
  target_type: 'account' | 'organization';
  target_id: string;
  requested_by_user_id: string;
  scheduled_for: string;
}

@Injectable()
export class AccountLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AccountLifecycleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly replay: ReplayService,
    private readonly email: EmailService
  ) {}

  onApplicationBootstrap() {
    const interval = Number(process.env.ACCOUNT_LIFECYCLE_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(
      () => void this.database.runExclusive('account-lifecycle.process', () => this.processDueRequests()).catch((error) => {
        this.logger.error('Account lifecycle processing failed.', error instanceof Error ? error.stack : error);
      }),
      Number.isFinite(interval) ? Math.max(interval, 60_000) : 60_000
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async getStatus(user: DashboardUser) {
    const [organizations, account] = await Promise.all([
      this.database.query<{
        id: string;
        name: string;
        role: string;
        request_id: string | null;
        scheduled_for: string | null;
        attempt_count: number | null;
      }>(
        `
          SELECT o.id, o.name, om.role, r.id AS request_id, r.scheduled_for, r.attempt_count
          FROM organization_members om
          JOIN organizations o ON o.id = om.organization_id
          LEFT JOIN account_lifecycle_requests r
            ON r.target_type = 'organization' AND r.target_id = o.id AND r.status = 'pending'
          WHERE om.user_id = $1
          ORDER BY o.created_at
        `,
        [user.id]
      ),
      this.database.query<{ id: string; scheduled_for: string; attempt_count: number }>(
        `
          SELECT id, scheduled_for, attempt_count FROM account_lifecycle_requests
          WHERE target_type = 'account' AND target_id = $1 AND status = 'pending'
          LIMIT 1
        `,
        [user.id]
      )
    ]);

    return {
      organizations: organizations.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        deletionScheduledAt: row.scheduled_for,
        deletionRequestId: row.request_id,
        deletionProcessingIssue: Boolean(row.attempt_count && row.scheduled_for && Date.now() >= new Date(row.scheduled_for).getTime())
      })),
      accountDeletionScheduledAt: account.rows[0]?.scheduled_for ?? null,
      accountDeletionProcessingIssue: Boolean(
        account.rows[0]?.attempt_count && Date.now() >= new Date(account.rows[0].scheduled_for).getTime()
      )
    };
  }

  async leaveOrganization(user: DashboardUser, organizationId: string) {
    const result = await this.database.query<{ role: string }>(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, user.id]
    );
    const role = result.rows[0]?.role;
    if (!role) throw new NotFoundException('Organization membership was not found.');
    if (role === 'owner') {
      throw new ConflictException('Owners cannot leave an organization. Schedule organization deletion instead.');
    }

    await this.database.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, user.id]
    );
    return { left: true, organizationId };
  }

  async scheduleOrganizationDeletion(user: DashboardUser, organizationId: string, confirmation: string) {
    if (confirmation !== 'DELETE') {
      throw new BadRequestException('Type DELETE to confirm organization deletion.');
    }

    return this.database.transaction(async (client) => {
      const membership = await client.query<{ name: string; role: string }>(
        `
          SELECT o.name, om.role FROM organizations o
          JOIN organization_members om ON om.organization_id = o.id
          WHERE o.id = $1 AND om.user_id = $2 FOR UPDATE OF o, om
        `,
        [organizationId, user.id]
      );
      const organization = membership.rows[0];
      if (!organization) throw new NotFoundException('Organization not found or not accessible.');
      if (organization.role !== 'owner') {
        throw new ForbiddenException('Only an organization owner can schedule deletion.');
      }

      const billing = await client.query(
        `
          SELECT 1 FROM subscriptions
          WHERE organization_id = $1 AND status IN ('trialing','active','past_due','unpaid','paused')
          LIMIT 1
        `,
        [organizationId]
      );
      if (billing.rows.length) {
        throw new ConflictException('Cancel the active subscription in Billing before scheduling organization deletion.');
      }

      const checkout = await client.query(
        `
          SELECT 1 FROM billing_checkout_sessions
          WHERE organization_id = $1 AND completed_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
          LIMIT 1
        `,
        [organizationId]
      );
      if (checkout.rows.length) {
        throw new ConflictException('A billing checkout is still pending. Complete or allow it to expire before deleting this organization.');
      }

      const result = await client.query<{ id: string; scheduled_for: string }>(
        `
          INSERT INTO account_lifecycle_requests
            (id, target_type, target_id, requested_by_user_id, scheduled_for)
          VALUES ($1, 'organization', $2, $3, now() + ($4::int * interval '1 day'))
          ON CONFLICT (target_type, target_id) WHERE status = 'pending'
          DO NOTHING
          RETURNING id, scheduled_for
        `,
        [`del_${randomUUID()}`, organizationId, user.id, DELETION_GRACE_DAYS]
      );
      if (!result.rows[0]) throw new ConflictException('Organization deletion is already scheduled.');
      return { requestId: result.rows[0].id, scheduledFor: result.rows[0].scheduled_for };
    });
  }

  async cancelOrganizationDeletion(user: DashboardUser, organizationId: string) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `
          UPDATE account_lifecycle_requests r
          SET status = 'cancelled', cancelled_at = now()
          WHERE r.target_type = 'organization' AND r.target_id = $1 AND r.status = 'pending'
            AND EXISTS (
              SELECT 1 FROM organization_members om
              WHERE om.organization_id = r.target_id AND om.user_id = $2 AND om.role = 'owner'
            )
          RETURNING r.id
        `,
        [organizationId, user.id]
      );
      if (!result.rowCount) throw new NotFoundException('Pending organization deletion was not found.');
      const account = await client.query(
        `
          UPDATE account_lifecycle_requests
          SET status = 'cancelled', cancelled_at = now()
          WHERE target_type = 'account' AND target_id = $1 AND status = 'pending'
        `,
        [user.id]
      );
      return { cancelled: true, accountDeletionCancelled: Boolean(account.rowCount) };
    });
  }

  async scheduleAccountDeletion(user: DashboardUser, confirmation: string) {
    if (confirmation !== 'DELETE') throw new BadRequestException('Type DELETE to confirm account deletion.');
    if (user.authMethod !== 'supabase') {
      throw new ForbiddenException('Account deletion requires an interactive Supabase account.');
    }
    this.auth.assertAccountDeletionAvailable();

    return this.database.transaction(async (client) => {
      const memberships = await client.query<{ organization_id: string; role: string; pending_deletion: boolean }>(
        `
          SELECT om.organization_id, om.role,
            EXISTS (
              SELECT 1 FROM account_lifecycle_requests r
              WHERE r.target_type = 'organization' AND r.target_id = om.organization_id AND r.status = 'pending'
            ) AS pending_deletion
          FROM organization_members om
          WHERE om.user_id = $1
          FOR UPDATE
        `,
        [user.id]
      );
      const blockers = memberships.rows.filter((membership) =>
        membership.role === 'owner' ? !membership.pending_deletion : true
      );
      if (blockers.length) {
        throw new ConflictException(
          'Leave organizations where you are a member, and schedule deletion for every organization you own before deleting your account.'
        );
      }

      const result = await client.query<{ id: string; scheduled_for: string }>(
        `
          INSERT INTO account_lifecycle_requests
            (id, target_type, target_id, requested_by_user_id, scheduled_for)
          VALUES ($1, 'account', $2, $2, now() + ($3::int * interval '1 day'))
          ON CONFLICT (target_type, target_id) WHERE status = 'pending'
          DO NOTHING
          RETURNING id, scheduled_for
        `,
        [`del_${randomUUID()}`, user.id, DELETION_GRACE_DAYS]
      );
      if (!result.rows[0]) throw new ConflictException('Account deletion is already scheduled.');
      return { requestId: result.rows[0].id, scheduledFor: result.rows[0].scheduled_for };
    });
  }

  async cancelAccountDeletion(user: DashboardUser) {
    const result = await this.database.query(
      `
        UPDATE account_lifecycle_requests
        SET status = 'cancelled', cancelled_at = now()
        WHERE target_type = 'account' AND target_id = $1 AND status = 'pending'
        RETURNING id
      `,
      [user.id]
    );
    if (!result.rowCount) throw new NotFoundException('Pending account deletion was not found.');
    return { cancelled: true };
  }

  async exportOrganization(user: DashboardUser, organizationId: string) {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const membership = await client.query<{ name: string; role: string }>(
        `
          SELECT o.name, om.role FROM organizations o
          JOIN organization_members om ON om.organization_id = o.id
          WHERE o.id = $1 AND om.user_id = $2
          FOR SHARE OF o
        `,
        [organizationId, user.id]
      );
      const organization = membership.rows[0];
      if (!organization) throw new NotFoundException('Organization not found or not accessible.');
      if (organization.role !== 'owner') {
        throw new ForbiddenException('Only an organization owner can export the complete organization dataset.');
      }

      const projectIds = await client.query<{ id: string }>(
        'SELECT id FROM projects WHERE organization_id = $1 ORDER BY created_at',
        [organizationId]
      );
      const tables = await client.query<{ table_name: string; columns: string[]; has_organization_id: boolean }>(
        `
          SELECT
            c.table_name,
            array_agg(c.column_name ORDER BY c.ordinal_position) AS columns,
            bool_or(c.column_name = 'organization_id') AS has_organization_id
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
          GROUP BY c.table_name
          HAVING bool_or(c.column_name IN ('organization_id', 'project_id'))
          ORDER BY c.table_name
        `
      );
      const exportData: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email ?? null },
        organization: {
          id: organizationId,
          name: organization.name,
          projects: projectIds.rows.map((row) => row.id)
        },
        tables: {}
      };
      const exportedTables = exportData.tables as Record<string, unknown>;
      let rowsExported = 0;
      let estimatedBytes = Buffer.byteLength(JSON.stringify(exportData));

      for (const table of tables.rows) {
        const columns = table.columns.filter((column) => !SENSITIVE_FIELD.test(column));
        if (!columns.length) continue;
        const quotedTable = quoteIdentifier(table.table_name);
        const quotedColumns = columns.map(quoteIdentifier).join(', ');
        const predicate = table.has_organization_id
          ? '"organization_id" = $1'
          : '"project_id" IN (SELECT id FROM projects WHERE organization_id = $1)';
        const records: Record<string, unknown>[] = [];

        for (let offset = 0; ; offset += 500) {
          const page = await client.query<Record<string, unknown>>(
            `SELECT ${quotedColumns}, ctid::text AS "__traceiq_ctid" FROM public.${quotedTable} WHERE ${predicate} ORDER BY ctid LIMIT 500 OFFSET $2`,
            [organizationId, offset]
          );
          if (page.rows.length === 0) break;
          const sanitized = page.rows.map((row) => {
            const { __traceiq_ctid: _ctid, ...data } = row;
            return sanitizeJson(data) as Record<string, unknown>;
          });
          const pageBytes = Buffer.byteLength(JSON.stringify(sanitized));
          rowsExported += sanitized.length;
          estimatedBytes += pageBytes;
          if (rowsExported > MAX_EXPORT_ROWS || estimatedBytes > MAX_EXPORT_BYTES) {
            throw new ConflictException(
              'This organization export exceeds the 10 MB or 50,000-row limit. Contact support for a larger archive.'
            );
          }
          records.push(...sanitized);
          if (page.rows.length < 500) break;
        }
        if (records.length) exportedTables[table.table_name] = records;
      }

      exportData.sessionReplayPayloads = await this.replay.exportForOrganization(
        organizationId,
        Math.max(0, MAX_EXPORT_BYTES - estimatedBytes)
      );
      if (Buffer.byteLength(JSON.stringify(exportData)) > MAX_EXPORT_BYTES) {
        throw new ConflictException(
          'This organization export exceeds the 10 MB limit. Contact support for a larger archive.'
        );
      }

      return {
        filename: `traceiq-organization-${safeFilename(organization.name)}.json`,
        data: exportData
      };
    });
  }

  async emailOrganizationExport(user: DashboardUser, organizationId: string) {
    if (!user.email) throw new BadRequestException('Your account does not have an email address.');
    const exportResult = await this.exportOrganization(user, organizationId);
    const content = JSON.stringify(exportResult.data);
    const sent = await this.email.send({
      to: [user.email],
      subject: `Your TraceIQ organization export: ${exportResult.filename}`,
      html: '<p>Your requested TraceIQ organization data export is attached to this email.</p>',
      attachments: [{ filename: exportResult.filename, content, contentType: 'application/json' }],
      idempotencyKey: `traceiq-export-${createHash('sha256').update(`${user.id}:${organizationId}:${Date.now()}`).digest('hex')}`
    });
    if (!sent.ok) throw new ServiceUnavailableException(`Could not send the organization export email: ${sent.failure}`);
    return { sent: true, recipient: user.email };
  }

  async processDueRequests() {
    const due = await this.database.query<LifecycleRequestRow>(
      `
        SELECT id, target_type, target_id, requested_by_user_id, scheduled_for
        FROM account_lifecycle_requests
        WHERE status = 'pending' AND scheduled_for <= now()
        ORDER BY CASE target_type WHEN 'organization' THEN 0 ELSE 1 END, scheduled_for
        LIMIT 20
      `
    );
    let completed = 0;
    for (const request of due.rows) {
      try {
        if (request.target_type === 'organization') {
          await this.database.transaction(async (client) => {
            const stillPending = await client.query(
              `SELECT 1 FROM account_lifecycle_requests WHERE id = $1 AND status = 'pending' AND scheduled_for <= now() FOR UPDATE`,
              [request.id]
            );
            if (!stillPending.rows.length) return;
            await this.replay.deleteForOrganization(request.target_id);
            await client.query('DELETE FROM organizations WHERE id = $1', [request.target_id]);
            await client.query(
              `UPDATE account_lifecycle_requests SET status = 'completed', completed_at = now(), last_error = NULL WHERE id = $1`,
              [request.id]
            );
          });
        } else {
          await this.database.transaction(async (client) => {
            const stillPending = await client.query<{ target_id: string }>(
              `SELECT target_id FROM account_lifecycle_requests WHERE id = $1 AND status = 'pending' AND scheduled_for <= now() FOR UPDATE`,
              [request.id]
            );
            if (!stillPending.rows.length) return;
            const activeOwnerOrganizations = await client.query(
              `
                SELECT 1 FROM organization_members om
                WHERE om.user_id = $1 AND om.role = 'owner'
                LIMIT 1
              `,
              [request.target_id]
            );
            if (activeOwnerOrganizations.rows.length) {
              throw new ConflictException('Account deletion is waiting for all owned organizations to finish deletion.');
            }
            await this.auth.deleteSupabaseUser(request.target_id);
            await client.query('DELETE FROM organization_members WHERE user_id = $1', [request.target_id]);
            await client.query('DELETE FROM personal_access_tokens WHERE user_id = $1', [request.target_id]);
            await client.query(
              `UPDATE account_lifecycle_requests SET status = 'completed', completed_at = now(), last_error = NULL WHERE id = $1`,
              [request.id]
            );
          });
        }
        completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown deletion failure.';
        await this.database.query(
          `
            UPDATE account_lifecycle_requests
            SET attempt_count = attempt_count + 1, last_error = $2
            WHERE id = $1 AND status = 'pending'
          `,
          [request.id, message.slice(0, 1000)]
        );
        this.logger.error(`Deletion request ${request.id} failed and will be retried: ${message}`);
      }
    }
    return { scanned: due.rows.length, completed };
  }
}

function quoteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new BadRequestException('Unexpected database identifier.');
  return `"${value}"`;
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'workspace';
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_FIELD.test(key))
        .map(([key, child]) => [key, sanitizeJson(child)])
    );
  }
  return value;
}

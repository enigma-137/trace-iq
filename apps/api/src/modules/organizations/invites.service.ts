import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService, QueryExecutor } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { EmailService, isValidEmail } from '../emails/email.service';
import { AuditService } from './audit.service';
import { MemberRole, OrganizationsService } from './organizations.service';

const INVITE_TTL_DAYS = 7;
const DASHBOARD_BASE_URL = process.env.DASHBOARD_URL ?? 'https://traceiq.run';

export interface CreateInviteRequestBody {
  email?: string;
  role?: MemberRole;
}

export interface AcceptInviteRequestBody {
  token?: string;
}

interface InviteRow extends QueryResultRow {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: MemberRole;
  token_prefix: string;
  invited_by: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface RawInviteRow extends QueryResultRow {
  id: string;
  organization_id: string;
  email: string;
  role: MemberRole;
  token_prefix: string;
  invited_by_user_id: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizations: OrganizationsService,
    private readonly email: EmailService,
    private readonly audit?: AuditService
  ) { }

  async createInvite(user: DashboardUser, body: CreateInviteRequestBody) {
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('A valid email is required.');
    }

    const inviteEmail = email.toLowerCase();
    if (user.email?.trim().toLowerCase() === inviteEmail) {
      throw new BadRequestException('You cannot invite yourself.');
    }

    const role = this.normalizeRole(body.role ?? 'member');
    if (role === 'owner') {
      throw new BadRequestException('Owners are promoted from existing members, not invited.');
    }

    const membership = await this.organizations.getMembership(user);
    if (!membership) {
      throw new BadRequestException('Create an organization before inviting teammates.');
    }
    if (!['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and admins can invite teammates.');
    }

    return this.database.transaction(async (client) => {
      await this.organizations.assertSeatAvailable(client, membership.id);

      const duplicate = await client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM organization_invites
            WHERE organization_id = $1 AND email = $2 AND status = 'pending'
          ) AS exists;
        `,
        [membership.id, inviteEmail]
      );
      if (duplicate.rows[0]?.exists) {
        throw new ConflictException('An invite is already pending for this email.');
      }

      const alreadyMember = await client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = $1 AND email = $2
          ) AS exists;
        `,
        [membership.id, inviteEmail]
      );
      if (alreadyMember.rows[0]?.exists) {
        throw new ConflictException('That user is already a member of this organization.');
      }

      const token = this.createToken();
      const invite = await this.insertInvite(client, membership.id, inviteEmail, role, token, user.id);

      const sent = await this.email.send({
        to: [inviteEmail],
        subject: `You've been invited to ${membership.name} on TraceIQ`,
        html: this.buildInviteEmail({
          token,
          email: inviteEmail,
          role,
          organizationName: membership.name,
          invitedByName: user.email ?? 'A teammate'
        })
      });

      await this.audit?.record({
        organizationId: membership.id,
        actorUserId: user.id,
        action: 'invite.created',
        targetEmail: inviteEmail,
        role
      });

      return {
        invite: this.mapInvite({ organization_name: membership.name, ...invite }),
        emailDelivered: sent.ok
      };
    });
  }

  async listInvites(user: DashboardUser) {
    const membership = await this.organizations.getMembership(user);
    if (!membership) {
      throw new BadRequestException('Create an organization before managing invites.');
    }
    if (!['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and admins can view team invites.');
    }

    const result = await this.database.query<InviteRow>(
      `
        SELECT
          i.id,
          i.organization_id,
          o.name AS organization_name,
          i.email,
          i.role,
          i.token_prefix,
          i.invited_by_user_id AS invited_by,
          i.status,
          i.expires_at,
          i.created_at
        FROM organization_invites i
        JOIN organizations o ON o.id = i.organization_id
        WHERE i.organization_id = $1
        ORDER BY i.created_at DESC;
      `,
      [membership.id]
    );

    return { invites: result.rows.map((row) => this.mapInvite(row)) };
  }

  async cancelInvite(user: DashboardUser, inviteId: string) {
    const membership = await this.organizations.getMembership(user);
    if (!membership) {
      throw new BadRequestException('Create an organization before managing invites.');
    }
    if (!['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and admins can cancel team invites.');
    }

    const result = await this.database.query<{ email: string; role: MemberRole }>(
      `
        UPDATE organization_invites
        SET status = 'revoked', token_hash = NULL, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        RETURNING email, role;
      `,
      [inviteId, membership.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Invite not found or already resolved.');
    }

    const cancelled = result.rows[0];
    await this.audit?.record({
      organizationId: membership.id,
      actorUserId: user.id,
      action: 'invite.cancelled',
      targetEmail: cancelled?.email ?? null,
      role: cancelled?.role ?? null
    });

    return { id: inviteId, status: 'revoked' as const };
  }

  async resendInvite(user: DashboardUser, inviteId: string) {
    const membership = await this.organizations.getMembership(user);
    if (!membership) {
      throw new BadRequestException('Create an organization before managing invites.');
    }
    if (!['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and admins can resend team invites.');
    }

    const existing = await this.database.query<RawInviteRow>(
      `
        SELECT id, organization_id, email, role, token_prefix, invited_by_user_id, status, expires_at, created_at
        FROM organization_invites
        WHERE id = $1 AND organization_id = $2
        LIMIT 1;
      `,
      [inviteId, membership.id]
    );

    const invite = existing.rows[0];
    if (!invite) {
      throw new NotFoundException('Invite not found.');
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException('Only pending invites can be resent.');
    }

    const token = this.createToken();
    const tokenHash = this.hashToken(token);

    await this.database.query(
      `
        UPDATE organization_invites
        SET token_hash = $3, token_prefix = $4, expires_at = now() + interval '7 days', updated_at = now()
        WHERE id = $1 AND organization_id = $2;
      `,
      [invite.id, membership.id, tokenHash, token.slice(0, 16)]
    );

    const sent = await this.email.send({
      to: [invite.email],
      subject: `You've been invited to ${membership.name} on TraceIQ`,
      html: this.buildInviteEmail({
        token,
        email: invite.email,
        role: invite.role,
        organizationName: membership.name,
        invitedByName: user.email ?? 'A teammate'
      })
    });

    await this.audit?.record({
      organizationId: membership.id,
      actorUserId: user.id,
      action: 'invite.resend',
      targetEmail: invite.email,
      role: invite.role
    });

    return {
      invite: {
        id: invite.id,
        organizationId: invite.organization_id,
        email: invite.email,
        role: invite.role,
        tokenPrefix: invite.token_prefix,
        invitedBy: invite.invited_by_user_id,
        status: 'pending',
        expiresAt: invite.expires_at,
        createdAt: invite.created_at
      },
      emailDelivered: sent.ok
    };
  }

  async acceptInvite(user: DashboardUser, token: string) {
    const normalizedToken = token?.trim() ?? '';
    if (!normalizedToken) {
      throw new BadRequestException('An invite token is required.');
    }

    const result = await this.database.query<{
      id: string;
      organization_id: string;
      email: string;
      role: MemberRole;
      status: string;
      expires_at: string;
    }>(
      `
        SELECT id, organization_id, email, role, status, expires_at
        FROM organization_invites
        WHERE token_hash = $1
        LIMIT 1;
      `,
      [this.hashToken(normalizedToken)]
    );

    const invite = result.rows[0];
    if (!invite) {
      throw new NotFoundException('That invite was not found.');
    }
    if (invite.status !== 'pending') {
      throw new GoneException('That invite has already been used or revoked.');
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new GoneException('That invite has expired.');
    }

    const userEmail = user.email?.trim().toLowerCase() ?? '';
    if (!userEmail || userEmail !== invite.email.trim().toLowerCase()) {
      throw new ForbiddenException('Sign in with the email address this invite was sent to.');
    }

    const membership = await this.database.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM organization_members
          WHERE organization_id = $1 AND user_id = $2
        ) AS exists;
      `,
      [invite.organization_id, user.id]
    );

    if (membership.rows[0]?.exists) {
      await this.markAccepted(invite.id);
      await this.audit?.record({
        organizationId: invite.organization_id,
        actorUserId: user.id,
        action: 'invite.accepted',
        targetUserId: user.id,
        targetEmail: invite.email,
        role: invite.role
      });
      return { accepted: true, organizationId: invite.organization_id, role: invite.role, alreadyMember: true };
    }

    await this.database.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO organization_members (organization_id, user_id, role, email)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (organization_id, user_id) DO NOTHING;
        `,
        [invite.organization_id, user.id, invite.role, invite.email]
      );
      await client.query(
        `
          UPDATE organization_invites
          SET status = 'accepted', updated_at = now()
          WHERE id = $1;
        `,
        [invite.id]
      );
    });

    await this.audit?.record({
      organizationId: invite.organization_id,
      actorUserId: user.id,
      action: 'invite.accepted',
      targetUserId: user.id,
      targetEmail: invite.email,
      role: invite.role
    });

    return { accepted: true, organizationId: invite.organization_id, role: invite.role };
  }

  /**
   * Public, token-keyed lookup for the /invite/[token] landing page. Reveals only
   * the org name, role and invited email — never the token.
   */
  async checkInvite(token: string) {
    const normalizedToken = token?.trim() ?? '';
    if (!normalizedToken) {
      return { valid: false, status: 'invalid' };
    }

    const result = await this.database.query<{
      organization_name: string;
      email: string;
      role: MemberRole;
      status: string;
      expires_at: string;
    }>(
      `
        SELECT o.name AS organization_name, i.email, i.role, i.status, i.expires_at
        FROM organization_invites i
        JOIN organizations o ON o.id = i.organization_id
        WHERE i.token_hash = $1
        LIMIT 1;
      `,
      [this.hashToken(normalizedToken)]
    );

    const invite = result.rows[0];
    if (!invite) {
      return { valid: false, status: 'not-found' as const };
    }

    const expired = new Date(invite.expires_at).getTime() < Date.now();
    if (invite.status !== 'pending' || expired) {
      return {
        valid: false,
        status: expired ? ('expired' as const) : (invite.status as 'accepted' | 'revoked')
      };
    }

    return {
      valid: true,
      organizationName: invite.organization_name,
      email: invite.email,
      role: invite.role
    };
  }

  private async insertInvite(
    client: QueryExecutor,
    organizationId: string,
    email: string,
    role: MemberRole,
    token: string,
    invitedBy: string
  ) {
    const result = await client.query<RawInviteRow>(
      `
        INSERT INTO organization_invites
          (id, organization_id, email, role, token_hash, token_prefix, invited_by_user_id, status, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', now() + interval '7 days')
        RETURNING id, organization_id, email, role, token_prefix, invited_by_user_id, status, expires_at, created_at;
      `,
      [this.inviteId(), organizationId, email, role, this.hashToken(token), token.slice(0, 16), invitedBy]
    );

    return result.rows[0];
  }

  private async markAccepted(inviteId: string) {
    await this.database.query(
      `
        UPDATE organization_invites
        SET status = 'accepted', updated_at = now()
        WHERE id = $1;
      `,
      [inviteId]
    );
  }

  private mapInvite(row: InviteRow | RawInviteRow) {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: (row as InviteRow).organization_name ?? null,
      email: row.email,
      role: row.role,
      tokenPrefix: row.token_prefix,
      invitedBy: row.invited_by_user_id ?? null,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  private createToken() {
    return `trq_inv_${randomBytes(32).toString('base64url')}`;
  }

  private inviteId() {
    return `inv_${randomUUID()}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeRole(value: MemberRole | undefined): MemberRole {
    if (!value || !['owner', 'admin', 'member'].includes(value)) {
      throw new BadRequestException('Role must be one of owner, admin, or member.');
    }
    return value;
  }

  private buildInviteEmail(args: {
    token: string;
    email: string;
    role: MemberRole;
    organizationName: string;
    invitedByName: string;
  }) {
    const acceptUrl = `${DASHBOARD_BASE_URL}/invite/${encodeURIComponent(args.token)}`;
    const roleLabel = args.role === 'admin' ? 'admin' : 'team member';

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#171717">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
          Hi ${args.email.split('@')[0]}, ${args.invitedByName} has invited you to join
          <strong>${escapeHtml(args.organizationName)}</strong> on TraceIQ as a ${roleLabel}.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6">
          TraceIQ gives you product analytics, funnels, retention, feature flags and error tracking in one place.
        </p>
        <a href="${escapeHtml(acceptUrl)}"
           style="display:inline-block;background:#204eb9ff;;color:#ffffff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
          Accept invite
        </a>
        <p style="margin:24px 0 0;font-size:13px;color:#737373;line-height:1.6">
          This invite expires in ${INVITE_TTL_DAYS} days. If you didn't expect this invite, you can safely ignore it.
        </p>
      </div>
    `;
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

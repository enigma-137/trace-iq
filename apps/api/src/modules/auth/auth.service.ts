import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';

export interface AmrEntry {
  method: string;
  timestamp: number;
}

export interface MfaFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardUser {
  id: string;
  email?: string;
  authMethod?: 'supabase' | 'pat' | 'local';
  scopes?: string[];
  amr?: AmrEntry[];
  factors?: MfaFactor[];
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
  factors?: MfaFactor[];
}

/**
 * Supabase `amr` method names that count as a completed second factor.
 * `password`/`oauth`/`otp` are primary sign-in methods and do not count.
 */
const MFA_METHODS = ['totp', 'webauthn', 'phone', 'sms'];

@Injectable()
export class AuthService {
  private localWorkspaceReady?: Promise<void>;

  constructor(private readonly database: DatabaseService) {}

  async getDashboardUser(authorizationHeader?: string): Promise<DashboardUser> {
    if (this.isLocalAuthMode()) {
      await this.ensureLocalWorkspace();
      return {
        id: 'traceiq-local-owner',
        email: 'local@traceiq.invalid',
        authMethod: 'local',
        amr: [],
        factors: []
      };
    }

    const token = this.getBearerToken(authorizationHeader);

    if (token.startsWith('tiq_pat_')) {
      return this.validatePersonalAccessToken(token);
    }

    const user = await this.getSupabaseUser(token);

    if (!user.id) {
      throw new UnauthorizedException('Supabase session is missing a user ID.');
    }

    return {
      id: user.id,
      email: user.email,
      authMethod: 'supabase',
      amr: this.decodeAmr(token),
      factors: user.factors
    };
  }

  /**
   * Resolves a user's Supabase Auth account from their email via the Admin API.
   * Uses the service-role key (server-side only) so team members can be added by
   * email without exposing admin credentials to the dashboard client.
   *
   * Returns `null` when no account exists for the email. Throws when the
   * service-role key is not configured or the Admin API is unreachable.
   */
  async resolveUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
    if (this.isLocalAuthMode()) {
      throw new ForbiddenException('Team invitations require an external authentication provider.');
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new UnauthorizedException(
        'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to invite team members by email.'
      );
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to look up the team member.');
    }

    const data = (await response.json()) as { users?: Array<{ id?: string; email?: string }> };
    const user = data.users?.[0];

    if (!user?.id) {
      return null;
    }

    return { id: user.id, email: user.email ?? email };
  }

  /**
   * Requires the user to hold one of the given roles in their primary
   * organization. Roles come from `organization_members`. PATs are always
   * rejected — role is a session concept and PAT access is enforced separately
   * via {@link requireScope}. Throws ForbiddenException when the user is not an
   * organization member or their role is not in the allowed set.
   */
  async requireRole(
    user: DashboardUser,
    roles: Array<'owner' | 'admin' | 'member'>
  ): Promise<void> {
    if (user.authMethod === 'pat') {
      throw new ForbiddenException('Personal access tokens cannot be used for role-gated actions.');
    }

    const result = await this.database.query<{ role: string }>(
      `
        SELECT om.role
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = $1
        ORDER BY o.created_at ASC
        LIMIT 1;
      `,
      [user.id]
    );

    const role = result.rows[0]?.role;

    if (!role || !roles.includes(role as 'owner' | 'admin' | 'member')) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
  }

  /**
   * Platform-admin gate for the operator console. Only users whose (lowercased)
   * email is listed in `platform_admins` pass. Personal access tokens are
   * rejected outright — admin access needs an interactive Supabase session with
   * a verified email. Throws ForbiddenException otherwise.
   */
  async requirePlatformAdmin(user: DashboardUser): Promise<void> {
    if (user.authMethod === 'pat' || !user.email) {
      throw new ForbiddenException('Platform admin access requires a signed-in session.');
    }

    const result = await this.database.query<{ email: string }>(
      `SELECT email FROM platform_admins WHERE email = $1 LIMIT 1`,
      [user.email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new ForbiddenException('You do not have platform admin access.');
    }
  }

  requireScope(user: DashboardUser, scope: string): void {
    if (user.authMethod !== 'pat') {
      return;
    }

    if (!user.scopes?.includes(scope)) {
      throw new ForbiddenException(`Personal access token requires "${scope}" scope.`);
    }
  }

  requireSupabaseSession(user: DashboardUser): void {
    if (user.authMethod === 'pat') {
      throw new ForbiddenException('Personal access tokens cannot manage personal access tokens.');
    }
  }

  private isLocalAuthMode(): boolean {
    return (process.env.AUTH_MODE ?? 'supabase').trim().toLowerCase() === 'local';
  }

  /**
   * Local mode retains the normal organization/project authorization model.
   * These deterministic rows are created idempotently so a fresh installation
   * opens directly into a usable workspace without an external identity service.
   */
  private ensureLocalWorkspace(): Promise<void> {
    if (!this.localWorkspaceReady) {
      this.localWorkspaceReady = this.provisionLocalWorkspace().catch((error) => {
        this.localWorkspaceReady = undefined;
        throw error;
      });
    }
    return this.localWorkspaceReady;
  }

  private async provisionLocalWorkspace(): Promise<void> {
    const writeKey = process.env.LOCAL_PROJECT_WRITE_KEY ?? 'trq_local_development_only';
    const writeKeyHash = createHash('sha256').update(writeKey).digest('hex');

    await this.database.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO organizations (id, name, slug, created_by_user_id)
          VALUES ('org_local', 'Local Workspace', 'local-workspace', 'traceiq-local-owner')
          ON CONFLICT (id) DO NOTHING;
        `
      );
      await client.query(
        `
          INSERT INTO organization_members (organization_id, user_id, role)
          VALUES ('org_local', 'traceiq-local-owner', 'owner')
          ON CONFLICT (organization_id, user_id)
          DO UPDATE SET role = 'owner', updated_at = now();
        `
      );
      await client.query(
        `
          INSERT INTO projects (id, organization_id, name, slug, created_by_user_id)
          VALUES ('proj_local', 'org_local', 'Local Project', 'local-project', 'traceiq-local-owner')
          ON CONFLICT (id) DO NOTHING;
        `
      );
      await client.query(
        `
          INSERT INTO project_write_keys (id, project_id, key_prefix, key_hash, name, created_by_user_id)
          VALUES ('pwk_local', 'proj_local', $1, $2, 'Local development write key', 'traceiq-local-owner')
          ON CONFLICT (id) DO NOTHING;
        `,
        [writeKey.slice(0, 16), writeKeyHash]
      );
    });
  }

  /**
   * Enforces step-up (MFA) for sensitive actions. The Supabase access token's
   * `amr` claim records the verification methods used in this session; a
   * session is considered MFA-verified when it carries a non-password method
   * (totp, webauthn, ...) confirmed within the configured freshness window.
   */
  requireStepUp(user: DashboardUser, maxAgeMinutes = 15): void {
    if (user.authMethod === 'pat') {
      throw new ForbiddenException('Personal access tokens cannot be used for actions that require step-up authentication.');
    }

    const amr = user.amr ?? [];
    const mfaMethod = MFA_METHODS.find((method) => amr.some((entry) => entry.method === method));

    if (!mfaMethod) {
      throw new ForbiddenException('Step-up authentication is required. Please complete a second factor before continuing.', 'STEP_UP_REQUIRED');
    }

    const mfaEntry = amr.find((entry) => entry.method === mfaMethod);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const stale = mfaEntry?.timestamp != null && nowSeconds - mfaEntry.timestamp > maxAgeMinutes * 60;

    if (stale) {
      throw new ForbiddenException('Step-up authentication expired. Please complete a second factor again.', 'STEP_UP_EXPIRED');
    }
  }

  /**
   * Conditional step-up: enforces {@link requireStepUp} only when the account has
   * at least one verified MFA factor. Users who never enrolled a second factor
   * are not locked out of otherwise-available actions — there is nothing to step
   * up to. PATs are always rejected, since these actions need an interactive
   * session.
   */
  requireStepUpIfEnrolled(user: DashboardUser, maxAgeMinutes = 15): void {
    if (user.authMethod === 'pat') {
      throw new ForbiddenException('Personal access tokens cannot be used for actions that require step-up authentication.');
    }

    const hasEnrolledMfa = (user.factors ?? []).some((factor) => factor.status === 'verified');

    if (!hasEnrolledMfa) {
      return;
    }

    this.requireStepUp(user, maxAgeMinutes);
  }

  /**
   * Decodes the `amr` (authentication method reference) claim from the token's
   * payload. The token is already validated by Supabase's /auth/v1/user above,
   * so this only parses the JWT payload (no signature needed). Returns empty
   * array for malformed/non-JWT tokens (e.g. legacy opaque tokens).
   */
  private decodeAmr(token: string): AmrEntry[] {
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return [];
      }

      const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const claims = JSON.parse(json) as { amr?: unknown };

      if (!Array.isArray(claims.amr)) {
        return [];
      }

      return claims.amr as AmrEntry[];
    } catch {
      return [];
    }
  }

  private getBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return authorizationHeader.slice('Bearer '.length).trim();
  }

  private async getSupabaseUser(token: string): Promise<SupabaseUserResponse> {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase API auth environment variables are not configured.');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired dashboard session.');
    }

    return (await response.json()) as SupabaseUserResponse;
  }

  private async validatePersonalAccessToken(token: string): Promise<DashboardUser> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const result = await this.database.query<{
      id: string;
      user_id: string;
      scopes: string[];
    }>(
      `
        SELECT id, user_id, scopes
        FROM personal_access_tokens
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `,
      [tokenHash]
    );

    const record = result.rows[0];
    if (!record) {
      throw new UnauthorizedException('Invalid or expired personal access token.');
    }

    await this.database.query(`UPDATE personal_access_tokens SET last_used_at = now() WHERE id = $1`, [record.id]);

    return {
      id: record.user_id,
      authMethod: 'pat',
      scopes: record.scopes
    };
  }
}



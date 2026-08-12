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
  authMethod?: 'supabase' | 'pat';
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
  constructor(private readonly database: DatabaseService) {}

  async getDashboardUser(authorizationHeader?: string): Promise<DashboardUser> {
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



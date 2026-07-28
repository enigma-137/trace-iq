import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';

export interface DashboardUser {
  id: string;
  email?: string;
  authMethod?: 'supabase' | 'pat';
  scopes?: string[];
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
}

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
      authMethod: 'supabase'
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



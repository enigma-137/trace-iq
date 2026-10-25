import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from './auth.service';

const DEFAULT_SCOPES = ['projects:read', 'flags:read'];
const ALLOWED_SCOPES = new Set([
  'projects:read',
  'flags:read',
  'flags:write',
  'analytics:read',
  'analytics:write',
  'insights:read',
  'funnels:read',
  'funnels:write',
  'users:read',
  'cohorts:read',
  'cohorts:write',
  'dashboards:read',
  'dashboards:write',
  'errors:read',
  'errors:write',
  'alerts:read',
  'alerts:write',
  'webhooks:read',
  'webhooks:write',
  'exports:read',
  'sourcemaps:write'
]);

export interface CreatePersonalAccessTokenRequest {
  name?: string;
  scopes?: unknown;
  expiresAt?: string | null;
}

@Injectable()
export class PersonalAccessTokensService {
  constructor(private readonly database: DatabaseService) {}

  async list(user: DashboardUser) {
    const result = await this.database.query(
      `
        SELECT id, name, token_prefix AS "tokenPrefix", scopes, created_at AS "createdAt",
          last_used_at AS "lastUsedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
        FROM personal_access_tokens
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [user.id]
    );

    return { tokens: result.rows };
  }

  async create(user: DashboardUser, body: CreatePersonalAccessTokenRequest) {
    const name = this.cleanName(body.name);
    const scopes = this.cleanScopes(body.scopes);
    const expiresAt = this.cleanExpiresAt(body.expiresAt);
    const value = `tiq_pat_${randomBytes(32).toString('base64url')}`;
    const tokenHash = createHash('sha256').update(value).digest('hex');
    const id = `pat_${randomUUID()}`;

    await this.database.query(
      `
        INSERT INTO personal_access_tokens (id, user_id, name, token_prefix, token_hash, scopes, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, user.id, name, value.slice(0, 16), tokenHash, scopes, expiresAt]
    );

    return {
      id,
      name,
      tokenPrefix: value.slice(0, 16),
      scopes,
      expiresAt,
      token: value
    };
  }

  async revoke(user: DashboardUser, id: string) {
    const result = await this.database.query(
      `
        UPDATE personal_access_tokens
        SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      `,
      [id, user.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Personal access token not found.');
    }

    return { revoked: true };
  }

  private cleanName(value: unknown): string {
    const name = typeof value === 'string' && value.trim() ? value.trim() : 'MCP token';

    if (name.length > 80) {
      throw new BadRequestException('Token name must be 80 characters or fewer.');
    }

    return name;
  }

  private cleanScopes(value: unknown): string[] {
    if (value === undefined) {
      return DEFAULT_SCOPES;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('scopes must be an array of strings.');
    }

    const scopes = [...new Set(value.map((scope) => (typeof scope === 'string' ? scope.trim() : '')))].filter(Boolean);

    if (scopes.length === 0) {
      throw new BadRequestException('At least one scope is required.');
    }

    const invalid = scopes.find((scope) => !ALLOWED_SCOPES.has(scope));
    if (invalid) {
      throw new BadRequestException(`Unsupported scope "${invalid}".`);
    }

    return scopes;
  }

  private cleanExpiresAt(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('expiresAt must be an ISO timestamp.');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expiresAt must be an ISO timestamp.');
    }

    return date.toISOString();
  }
}

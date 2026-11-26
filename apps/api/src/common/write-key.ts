import { createHash } from 'node:crypto';
import type { DatabaseService } from '../database/database.service';

/**
 * Resolves the project a public SDK request belongs to from its write key.
 *
 * The key is always checked. When the request also names a project, the key must
 * belong to that project. Revoked keys and organizations scheduled for deletion are
 * refused, as on event ingest. Returns null when the request can't be authenticated,
 * so each caller keeps its own error response.
 *
 * A project ID alone is never enough: project IDs are public, and accepting one
 * without its key would keep revoked keys working.
 */
export async function resolveWriteKeyProject(
  database: Pick<DatabaseService, 'query'>,
  writeKey: unknown,
  projectId?: unknown
): Promise<string | null> {
  if (typeof writeKey !== 'string' || !writeKey.trim()) return null;
  if (projectId !== undefined && projectId !== null && projectId !== '' && typeof projectId !== 'string') return null;

  const keyHash = createHash('sha256').update(writeKey).digest('hex');
  const scopedToProject = typeof projectId === 'string' && projectId !== '';
  const result = await database.query<{ project_id: string }>(
    `
      SELECT pwk.project_id
      FROM project_write_keys pwk
      JOIN projects p ON p.id = pwk.project_id
      WHERE pwk.key_hash = $1
        AND pwk.revoked_at IS NULL
        ${scopedToProject ? 'AND pwk.project_id = $2' : ''}
        AND NOT EXISTS (
          SELECT 1 FROM account_lifecycle_requests r
          WHERE r.target_type = 'organization' AND r.target_id = p.organization_id AND r.status = 'pending'
        )
      LIMIT 1
    `,
    scopedToProject ? [keyHash, projectId] : [keyHash]
  );

  return result.rows[0]?.project_id ?? null;
}

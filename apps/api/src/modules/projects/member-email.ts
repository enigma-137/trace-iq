import type { DatabaseService } from '../../database/database.service';

/**
 * SQL expression resolving a workspace member's email from a user id column on a
 * project-scoped table. Both arguments are trusted column names, never user input.
 */
export function memberEmailSql(userIdColumn: string, projectIdColumn: string): string {
  return `(
    SELECT om.email
    FROM organization_members om
    JOIN projects p ON p.organization_id = om.organization_id
    WHERE p.id = ${projectIdColumn} AND om.user_id = ${userIdColumn}
    LIMIT 1
  )`;
}

/**
 * Fills in a member's email when it isn't known yet, so teammates can see who owns
 * what. Best-effort: a failure here must never break the page that triggered it.
 */
export async function rememberMemberEmail(
  database: Pick<DatabaseService, 'query'>,
  organizationId: string,
  userId: string,
  email: string
): Promise<void> {
  try {
    await database.query(
      `UPDATE organization_members SET email = $3, updated_at = now()
       WHERE organization_id = $1 AND user_id = $2 AND email IS NULL`,
      [organizationId, userId, email.trim().toLowerCase()]
    );
  } catch {
    // The owner column falls back to "Unknown" until the next successful read.
  }
}

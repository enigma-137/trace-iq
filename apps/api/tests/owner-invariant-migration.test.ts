import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The trigger itself was checked against Postgres (PGlite) when 0074 was written:
// removing a member, leaving, and deleting an organization all delete the rows, and
// removing or demoting the last owner of a live organization is still refused.
describe('0074 owner invariant', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/0074_owner_invariant_allows_org_deletion.sql'), 'utf8');
  const body = sql.slice(sql.indexOf('BEGIN'), sql.lastIndexOf('END;'));
  const deleteBranch = body.slice(body.indexOf("IF TG_OP = 'DELETE' THEN"), body.indexOf("IF TG_OP = 'UPDATE'"));

  it('always lets a DELETE through by returning OLD, never NEW (NULL), which would skip the row', () => {
    expect(deleteBranch).toMatch(/RETURN OLD;\s*END IF;\s*$/);
    expect(deleteBranch).not.toContain('RETURN NEW');
  });

  it('only refuses removing the last owner while the organization still exists', () => {
    expect(deleteBranch).toContain("OLD.role = 'owner'");
    expect(deleteBranch).toContain('AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id)');
    expect(deleteBranch).toContain("RAISE EXCEPTION 'An organization must keep at least one owner'");
  });

  it('still refuses demoting the last owner', () => {
    expect(body).toMatch(/IF TG_OP = 'UPDATE' AND OLD\.role = 'owner' AND NEW\.role IS DISTINCT FROM 'owner' THEN[\s\S]*RAISE EXCEPTION/);
  });
});

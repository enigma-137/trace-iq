import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { AccountLifecycleService } from '../src/modules/account-lifecycle/account-lifecycle.service';
import { mockDatabase, rows } from './helpers/mock-db';

const user = { id: 'auth-user-1', email: 'owner@example.test', authMethod: 'supabase' as const };

function makeService(onQuery: Parameters<typeof mockDatabase>[0]) {
  const database = mockDatabase(onQuery);
  const replay = {
    deleteForOrganization: vi.fn().mockResolvedValue({ deleted: 0 }),
    exportForOrganization: vi.fn().mockResolvedValue([])
  };
  const auth = {
    deleteSupabaseUser: vi.fn().mockResolvedValue(undefined),
    assertAccountDeletionAvailable: vi.fn()
  };
  const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
  return {
    service: new AccountLifecycleService(database as never, auth as never, replay as never, email as never),
    database,
    replay,
    auth,
    email
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AccountLifecycleService', () => {
  it('schedules organization deletion only for an owner with no active billing', async () => {
    const { service, database } = makeService((text) => {
      if (/SELECT o\.name, om\.role/.test(text)) return rows([{ name: 'Acme', role: 'owner' }]);
      if (/FROM subscriptions/.test(text)) return rows([]);
      if (/FROM billing_checkout_sessions/.test(text)) return rows([]);
      if (/INSERT INTO account_lifecycle_requests/.test(text)) {
        return rows([{ id: 'del_1', scheduled_for: '2026-11-26T00:00:00Z' }]);
      }
      return rows([]);
    });

    await expect(service.scheduleOrganizationDeletion(user, 'org_1', 'DELETE')).resolves.toEqual({
      requestId: 'del_1',
      scheduledFor: '2026-11-26T00:00:00Z'
    });
    expect(database.queryCalls(/INSERT INTO account_lifecycle_requests/)).toHaveLength(1);
    expect(database.calls.find((call) => /INSERT INTO account_lifecycle_requests/.test(call.text))?.values[3]).toBe(30);
  });

  it('blocks organization deletion while a subscription is active', async () => {
    const { service } = makeService((text) => {
      if (/SELECT o\.name, om\.role/.test(text)) return rows([{ name: 'Acme', role: 'owner' }]);
      if (/FROM subscriptions/.test(text)) return rows([{ '?column?': 1 }]);
      return rows([]);
    });

    await expect(service.scheduleOrganizationDeletion(user, 'org_1', 'DELETE')).rejects.toThrow(ConflictException);
  });

  it('does not let an organization owner leave instead of deleting or transferring it', async () => {
    const { service } = makeService((text) =>
      /SELECT role FROM organization_members/.test(text) ? rows([{ role: 'owner' }]) : rows([])
    );

    await expect(service.leaveOrganization(user, 'org_1')).rejects.toThrow(ConflictException);
  });

  it('schedules account deletion only after owned organizations are queued and other memberships are left', async () => {
    const { service, auth } = makeService((text) => {
      if (/FROM organization_members om/.test(text)) {
        return rows([{ organization_id: 'org_1', role: 'owner', pending_deletion: true }]);
      }
      if (/INSERT INTO account_lifecycle_requests/.test(text)) {
        return rows([{ id: 'del_account', scheduled_for: '2026-11-26T00:00:00Z' }]);
      }
      return rows([]);
    });

    await expect(service.scheduleAccountDeletion(user, 'DELETE')).resolves.toEqual({
      requestId: 'del_account',
      scheduledFor: '2026-11-26T00:00:00Z'
    });
    expect(auth.assertAccountDeletionAvailable).toHaveBeenCalledOnce();
  });

  it('blocks account deletion while the user still belongs to another organization', async () => {
    const { service } = makeService((text) =>
      /FROM organization_members om/.test(text)
        ? rows([{ organization_id: 'org_2', role: 'member', pending_deletion: false }])
        : rows([])
    );

    await expect(service.scheduleAccountDeletion(user, 'DELETE')).rejects.toThrow(ConflictException);
  });

  it('waits for owned organizations to finish deletion before removing the auth account', async () => {
    const { service, auth, database } = makeService((text) => {
      if (/SELECT id, target_type, target_id, requested_by_user_id, scheduled_for/.test(text)) {
        return rows([{
          id: 'del_account',
          target_type: 'account',
          target_id: user.id,
          requested_by_user_id: user.id,
          scheduled_for: '2026-10-27T00:00:00Z'
        }]);
      }
      if (/SELECT target_id FROM account_lifecycle_requests/.test(text)) {
        return rows([{ target_id: user.id }]);
      }
      if (/FROM organization_members om/.test(text)) {
        return rows([{ '?column?': 1 }]);
      }
      return rows([]);
    });

    await expect(service.processDueRequests()).resolves.toEqual({ scanned: 1, completed: 0 });
    expect(auth.deleteSupabaseUser).not.toHaveBeenCalled();
    expect(database.queryCalls(/attempt_count = attempt_count \+ 1/)).toHaveLength(1);
  });

  it('exports organization rows while removing secret-bearing fields', async () => {
    const { service } = makeService((text) => {
      if (/SELECT o\.name, om\.role/.test(text)) return rows([{ name: 'Acme', role: 'owner' }]);
      if (/SELECT id FROM projects/.test(text)) return rows([{ id: 'project_1' }]);
      if (/information_schema\.columns/.test(text)) {
        return rows([{
          table_name: 'sample_records',
          columns: ['organization_id', 'name', 'api_secret'],
          has_organization_id: true
        }]);
      }
      if (/FROM public\."sample_records"/.test(text)) {
        return rows([{ organization_id: 'org_1', name: 'sample', api_secret: 'must-not-export' }]);
      }
      return rows([]);
    });

    const result = await service.exportOrganization(user, 'org_1');
    const records = (result.data as { tables: Record<string, Array<Record<string, unknown>>> }).tables.sample_records;
    expect(records).toEqual([{ organization_id: 'org_1', name: 'sample' }]);
    expect(JSON.stringify(result.data)).not.toContain('must-not-export');
  });
});

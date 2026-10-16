import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import { FlagsService } from '../src/modules/flags/flags.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error(code === '40P01' ? 'deadlock detected' : 'duplicate key'), { code, constraint });
}

function eventsService(failures: Error[]) {
  const pending = [...failures];
  const db = mockDatabase((text) => {
    if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
    if (text.includes('INSERT INTO sessions') && pending.length > 0) throw pending.shift();
    return affected(1);
  });
  const service = new EventsService(
    db as never,
    { deliverForEvent: vi.fn().mockResolvedValue(undefined) } as never,
    { afterProjectIngest: vi.fn().mockResolvedValue(undefined) } as never,
    { consumeProjectEvents: vi.fn().mockResolvedValue({}) } as never
  );
  return { db, service };
}

const event = { writeKey: 'key', projectId: 'proj_1', eventName: '$page', sessionId: 'sess_new', anonymousId: 'anon_1' };

describe('session upsert under concurrency', () => {
  it('retries when a concurrent request created the same session (non-arbiter unique index)', async () => {
    const { db, service } = eventsService([pgError('23505', 'sessions_id_project_replay_fk_idx')]);
    await expect(service.ingest(event)).resolves.toMatchObject({ accepted: true });
    expect(db.queryCalls('INSERT INTO sessions')).toHaveLength(2);
    expect(db.queryCalls(/INSERT INTO events/)).toHaveLength(1);
  });

  it('retries a deadlock with identity stitching', async () => {
    const { db, service } = eventsService([pgError('40P01')]);
    await expect(service.ingestBatch('key', 'proj_1', [event, { ...event, sessionId: 'sess_a' }])).resolves.toMatchObject({
      accepted: true
    });
    expect(db.queryCalls('INSERT INTO sessions')).toHaveLength(2);
  });

  it('gives up after three attempts and does not retry unrelated errors', async () => {
    const conflict = () => pgError('23505', 'sessions_id_project_replay_fk_idx');
    const exhausted = eventsService([conflict(), conflict(), conflict()]);
    await expect(exhausted.service.ingest(event)).rejects.toMatchObject({ code: '23505' });
    expect(exhausted.db.queryCalls('INSERT INTO sessions')).toHaveLength(3);

    const other = eventsService([pgError('23505', 'some_other_constraint')]);
    await expect(other.service.ingest(event)).rejects.toMatchObject({ constraint: 'some_other_constraint' });
    expect(other.db.queryCalls('INSERT INTO sessions')).toHaveLength(1);
  });

  it('inserts batch sessions in a stable order', async () => {
    const { db, service } = eventsService([]);
    await service.ingestBatch('key', 'proj_1', [
      { ...event, sessionId: 'sess_c' },
      { ...event, sessionId: 'sess_a' },
      { ...event, sessionId: 'sess_b' }
    ]);
    const values = db.queryCalls('INSERT INTO sessions')[0].values;
    expect([values[0], values[5], values[10]]).toEqual(['sess_a', 'sess_b', 'sess_c']);
  });
});

describe('flag exposure identity', () => {
  function flags(resolved: { user_id: string | null; session_id: string | null }) {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) return rows([{ project_id: 'proj_1', organization_id: 'org_1' }]);
      if (text.includes('FROM feature_flags')) return rows([{ id: 'flg_1', key: 'new-shop', name: 'New shop', revision: 2, rollout_percentage: 50 }]);
      if (text.includes('FROM users WHERE project_id')) return rows([resolved]);
      return affected(1);
    });
    return { db, service: new FlagsService(db as never, {} as never) };
  }

  const exposure = { flagKey: 'new-shop', distinctId: 'player_42', userId: 'player_42', sessionId: 'sess_x', enabled: true };

  it('stores the internal user id for an external userId', async () => {
    const { db, service } = flags({ user_id: 'usr_internal', session_id: 'sess_x' });
    await service.trackExposure('key', 'proj_1', exposure);
    const lookup = db.queryCalls('FROM users WHERE project_id')[0];
    expect(lookup.values).toEqual(['proj_1', 'player_42', 'sess_x']);
    expect(db.queryCalls('INSERT INTO feature_flag_exposures')[0].values[7]).toBe('usr_internal');
    expect(db.queryCalls('INSERT INTO events')[0].values[3]).toBe('usr_internal');
  });

  it('writes nulls instead of violating foreign keys for unknown users and sessions', async () => {
    const { db, service } = flags({ user_id: null, session_id: null });
    await expect(service.trackExposure('key', 'proj_1', exposure)).resolves.toMatchObject({ accepted: true });
    const exposureValues = db.queryCalls('INSERT INTO feature_flag_exposures')[0].values;
    expect(exposureValues[6]).toBe('player_42');
    expect(exposureValues[7]).toBeNull();
    expect(exposureValues[9]).toBeNull();
    expect(db.queryCalls('INSERT INTO events')[0].values[5]).toBeNull();
  });
});

import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';

/** A DatabaseService whose pool hands out one scripted client. */
function withFakeClient(options: { lockGranted?: boolean; unlockFails?: boolean } = {}) {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: options.lockGranted ?? true }], rowCount: 1 };
      if (text.includes('pg_advisory_unlock') && options.unlockFails) throw new Error('connection lost');
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn()
  };
  const service = new DatabaseService();
  (service as unknown as { pool: { connect: () => Promise<typeof client> } }).pool = { connect: async () => client };
  return { service, client, queries };
}

describe('DatabaseService.runExclusive', () => {
  it('runs the task under the lock, then unlocks and returns the connection', async () => {
    const { service, client, queries } = withFakeClient();
    const task = vi.fn(async () => undefined);

    await expect(service.runExclusive('alerts.evaluate', task)).resolves.toBe(true);

    expect(task).toHaveBeenCalledOnce();
    expect(queries.map((q) => q.text)).toEqual([
      'SELECT pg_try_advisory_lock($1, hashtext($2)) AS locked',
      'SELECT pg_advisory_unlock($1, hashtext($2))'
    ]);
    expect(queries[0].values[1]).toBe('alerts.evaluate');
    expect(queries[1].values).toEqual(queries[0].values);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('skips the task when another instance holds the lock', async () => {
    const { service, client, queries } = withFakeClient({ lockGranted: false });
    const task = vi.fn(async () => undefined);

    await expect(service.runExclusive('alerts.evaluate', task)).resolves.toBe(false);

    expect(task).not.toHaveBeenCalled();
    expect(queries.some((q) => q.text.includes('pg_advisory_unlock'))).toBe(false);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('unlocks even when the task throws', async () => {
    const { service, client, queries } = withFakeClient();
    await expect(service.runExclusive('webhooks.retry-sweep', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(queries.some((q) => q.text.includes('pg_advisory_unlock'))).toBe(true);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('destroys the connection if unlocking fails, so a held lock never returns to the pool', async () => {
    const { service, client } = withFakeClient({ unlockFails: true });
    await expect(service.runExclusive('billing.reconcile', async () => undefined)).resolves.toBe(true);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });
});

// Real two-replica behaviour. Runs only when a scratch database is provided, e.g.
// TRACEIQ_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test
const databaseUrl = process.env.TRACEIQ_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('DatabaseService.runExclusive against Postgres', () => {
  const services: DatabaseService[] = [];
  const replica = () => {
    const service = new DatabaseService();
    (service as unknown as { pool: Pool }).pool = new Pool({ connectionString: databaseUrl });
    services.push(service);
    return service;
  };

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.onApplicationShutdown()));
  });

  it('lets only one replica run a job at a time', async () => {
    const [a, b] = [replica(), replica()];
    let finishA!: () => void;
    const aRunning = new Promise<void>((resolve) => {
      const started = a.runExclusive('test.job', () => {
        resolve();
        return new Promise<void>((done) => { finishA = done; });
      });
      void started;
    });
    await aRunning;

    const bTask = vi.fn(async () => undefined);
    await expect(b.runExclusive('test.job', bTask)).resolves.toBe(false);
    expect(bTask).not.toHaveBeenCalled();

    // A different job name is not blocked.
    await expect(b.runExclusive('test.other-job', bTask)).resolves.toBe(true);
    expect(bTask).toHaveBeenCalledOnce();

    finishA();
    await vi.waitFor(async () => expect(await b.runExclusive('test.job', async () => undefined)).toBe(true));
  });

  it('releases the lock when the task throws', async () => {
    const [a, b] = [replica(), replica()];
    await expect(a.runExclusive('test.failing-job', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(b.runExclusive('test.failing-job', async () => undefined)).resolves.toBe(true);
  });
});

describe('periodic jobs with side effects run under a job lock', () => {
  afterEach(() => vi.useRealTimers());

  function lockingDatabase() {
    return { runExclusive: vi.fn(async () => false), query: vi.fn() };
  }

  it('alert evaluation', async () => {
    vi.useFakeTimers();
    const { AlertsService } = await import('../src/modules/alerts/alerts.service');
    const database = lockingDatabase();
    const service = new AlertsService(database as never, {} as never, {} as never, {} as never, {} as never);
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(database.runExclusive).toHaveBeenCalledWith('alerts.evaluate', expect.any(Function));
    expect(database.query).not.toHaveBeenCalled(); // lock held elsewhere: nothing evaluated here
    service.onModuleDestroy();
  });

  it('webhook retry sweep', async () => {
    vi.useFakeTimers();
    const { WebhooksService } = await import('../src/modules/webhooks/webhooks.service');
    const database = lockingDatabase();
    const service = new WebhooksService(database as never, {} as never);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(database.runExclusive).toHaveBeenCalledWith('webhooks.retry-sweep', expect.any(Function));
    expect(database.query).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});

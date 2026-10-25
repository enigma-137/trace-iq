import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseConfig } from './database.config';

// First key of every job advisory lock, so TraceIQ's locks can't collide with
// another application's advisory locks on a shared database.
const JOB_LOCK_NAMESPACE = 734_201;

export interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: databaseConfig.url,
    max: databaseConfig.poolSize,
    // PostgreSQL uses this connection-local setting in the events RLS policy.
    // The value comes from server configuration only; clients cannot influence it.
    options: `-c traceiq.deployment_mode=${process.env.TRACEIQ_DEPLOYMENT_MODE === 'cloud' ? 'cloud' : 'self_hosted'}`,
    ssl: databaseConfig.ssl
      ? { rejectUnauthorized: databaseConfig.sslRejectUnauthorized }
      : undefined
  } as ConstructorParameters<typeof Pool>[0] & { options: string });

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs `task` unless another API instance is already running the job called
   * `name`, so periodic jobs run once across replicas instead of once per replica.
   * Uses a Postgres session advisory lock held on a dedicated connection for the
   * task's duration; Postgres releases it if the process or connection dies.
   * Resolves to false when the job was skipped because another instance holds it.
   */
  async runExclusive(name: string, task: () => Promise<unknown>): Promise<boolean> {
    const client = await this.pool.connect();
    let locked = false;
    let releaseError: Error | undefined;
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1, hashtext($2)) AS locked',
        [JOB_LOCK_NAMESPACE, name]
      );
      locked = result.rows[0]?.locked === true;
      if (!locked) return false;
      await task();
      return true;
    } finally {
      if (locked) {
        try {
          await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [JOB_LOCK_NAMESPACE, name]);
        } catch (error) {
          // A connection that may still hold the lock must not go back to the pool.
          releaseError = error instanceof Error ? error : new Error('advisory unlock failed');
        }
      }
      client.release(releaseError);
    }
  }

  async ping(): Promise<void> {
    await this.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseConfig } from './database.config';

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
    ssl: databaseConfig.ssl
      ? { rejectUnauthorized: databaseConfig.sslRejectUnauthorized }
      : undefined
  });

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

  async ping(): Promise<void> {
    await this.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

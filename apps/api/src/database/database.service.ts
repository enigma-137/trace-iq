import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { databaseConfig } from './database.config';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: databaseConfig.url,
    max: databaseConfig.poolSize,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : undefined
  });

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async ping(): Promise<void> {
    await this.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

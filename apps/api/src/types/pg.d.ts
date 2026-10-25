declare module 'pg' {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
    rows: T[];
    rowCount: number;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    ssl?: { rejectUnauthorized?: boolean };
  }

  export interface PoolClient {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<T>>;
    /** Passing an error (or true) destroys the connection instead of returning it to the pool. */
    release(destroy?: Error | boolean): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}

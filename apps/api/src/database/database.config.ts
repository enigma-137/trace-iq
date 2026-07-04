export interface DatabaseConfig {
  url: string;
  poolSize: number;
  ssl: boolean;
  safeHost: string;
  safeDatabaseName: string;
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq';
const parsedDatabaseUrl = new URL(databaseUrl);

export const databaseConfig: DatabaseConfig = {
  url: databaseUrl,
  poolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === 'true',
  safeHost: parsedDatabaseUrl.host,
  safeDatabaseName: parsedDatabaseUrl.pathname.replace(/^\//, '') || 'unknown'
};

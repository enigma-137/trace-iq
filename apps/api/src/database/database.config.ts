export interface DatabaseConfig {
  url: string;
  poolSize: number;
  ssl: boolean;
}

export const databaseConfig: DatabaseConfig = {
  url: process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq',
  poolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === 'true'
};

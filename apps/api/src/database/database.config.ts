export interface DatabaseConfig {
  url: string;
  poolSize: number;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq';

export const databaseConfig: DatabaseConfig = {
  url: databaseUrl,
  poolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === 'true',
  // TLS connections verify the server certificate by default. Only disable when
  // connecting to a dev database with a self-signed cert you explicitly trust.
  sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
};

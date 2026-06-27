const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq';
const command = process.argv[2] ?? 'up';

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsDir);
  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(result.rows.map((row) => row.filename));
}

async function printStatus(client) {
  await ensureMigrationsTable(client);

  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations(client);

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const file of files) {
    console.log(`${applied.has(file) ? 'applied' : 'pending'}  ${file}`);
  }
}

async function runPendingMigrations(client) {
  await ensureMigrationsTable(client);

  const files = await listMigrationFiles();
  const applied = await getAppliedMigrations(client);
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  for (const file of pending) {
    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, 'utf8');

    console.log(`Applying ${file}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function main() {
  if (command === '--help' || command === 'help') {
    console.log('Usage: node scripts/migrate.js [up|status]');
    return;
  }

  if (!['up', 'status'].includes(command)) {
    throw new Error(`Unknown migration command "${command}". Use "up" or "status".`);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (command === 'status') {
      await printStatus(client);
    } else {
      await runPendingMigrations(client);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

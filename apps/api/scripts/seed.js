const crypto = require('node:crypto');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://traceiq:traceiq@localhost:5432/traceiq';
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

const seed = {
  organizationId: process.env.TRACEIQ_SEED_ORG_ID ?? 'org_demo',
  organizationName: process.env.TRACEIQ_SEED_ORG_NAME ?? 'Demo Organization',
  organizationSlug: process.env.TRACEIQ_SEED_ORG_SLUG ?? 'demo',
  projectId: process.env.TRACEIQ_SEED_PROJECT_ID ?? 'proj_demo',
  projectName: process.env.TRACEIQ_SEED_PROJECT_NAME ?? 'Demo Project',
  projectSlug: process.env.TRACEIQ_SEED_PROJECT_SLUG ?? 'demo-project',
  writeKeyId: process.env.TRACEIQ_SEED_WRITE_KEY_ID ?? 'wkey_demo',
  writeKey: process.env.TRACEIQ_SEED_WRITE_KEY ?? 'trq_dev_write_key_demo'
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl });
  await client.connect();

  const keyHash = sha256(seed.writeKey);
  const keyPrefix = seed.writeKey.slice(0, 12);

  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO organizations (id, name, slug)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            updated_at = now()
      `,
      [seed.organizationId, seed.organizationName, seed.organizationSlug]
    );

    await client.query(
      `
        INSERT INTO projects (id, organization_id, name, slug)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            updated_at = now()
      `,
      [seed.projectId, seed.organizationId, seed.projectName, seed.projectSlug]
    );

    await client.query(
      `
        INSERT INTO project_write_keys (id, project_id, key_prefix, key_hash, name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET project_id = EXCLUDED.project_id,
            key_prefix = EXCLUDED.key_prefix,
            key_hash = EXCLUDED.key_hash,
            name = EXCLUDED.name,
            revoked_at = NULL
      `,
      [seed.writeKeyId, seed.projectId, keyPrefix, keyHash, 'Demo write key']
    );

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log(`Organization: ${seed.organizationId}`);
    console.log(`Project: ${seed.projectId}`);
    console.log(`Write key: ${seed.writeKey}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

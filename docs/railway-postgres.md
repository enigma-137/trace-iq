# Railway PostgreSQL Setup

Use Railway PostgreSQL as the MVP database until local Docker or a managed staging stack is available.

## Required Environment

```bash
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

Set `DATABASE_SSL=false` only for a trusted local database.

## Initialize Database

Run these from the repository root after `DATABASE_URL` is set:

```bash
npm run migrate -w @traceiq/api
npm run seed -w @traceiq/api
```

The seed creates:

```text
Organization: org_demo
Project: proj_demo
Write key: trq_dev_write_key_demo
```

You can override seed values with:

```bash
TRACEIQ_SEED_ORG_ID=
TRACEIQ_SEED_ORG_NAME=
TRACEIQ_SEED_ORG_SLUG=
TRACEIQ_SEED_PROJECT_ID=
TRACEIQ_SEED_PROJECT_NAME=
TRACEIQ_SEED_PROJECT_SLUG=
TRACEIQ_SEED_WRITE_KEY_ID=
TRACEIQ_SEED_WRITE_KEY=
```

## Verify API Config

Start the API with the same `DATABASE_URL`:

```bash
npm run dev -w @traceiq/api
```

Then check:

```bash
curl http://localhost:4000/health
```

# API Database Migrations

TraceIQ will use plain SQL migrations for the MVP.

This keeps the first database layer easy to inspect, review, and run without adding an ORM before the event ingestion path exists. Migration files should be ordered by timestamp or sequence number and should contain deterministic PostgreSQL DDL.

Initial migration target:

```text
organizations
projects
project_write_keys
users
sessions
events
```

Run migrations from the API workspace:

```bash
npm run migrate -w @traceiq/api
npm run migrate:status -w @traceiq/api
npm run seed -w @traceiq/api
```

The runner reads `DATABASE_URL` and falls back to the local development URL documented in `.env.example`.
Set `DATABASE_SSL=true` for hosted Postgres providers that require SSL.

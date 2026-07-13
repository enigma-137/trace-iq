# API Database Migrations

TraceIQ will use plain SQL migrations for the MVP.

This keeps the first database layer easy to inspect, review, and run without adding an ORM before the event ingestion path exists. Migration files should be ordered by timestamp or sequence number and should contain deterministic PostgreSQL DDL.

Initial migration target:

```text
organizations
organization_members
projects
project_write_keys
users
sessions
events
```

Auth/project-access migration target:

```text
organization_members
organizations.created_by_user_id
projects.created_by_user_id
projects.allowed_origins
project_write_keys.created_by_user_id
project_write_keys.revoked_by_user_id
project_write_keys.last_used_at
project_write_keys.expires_at
```

Run migrations from the API workspace:

```bash
npm run migrate -w @traceiq/api
npm run migrate:status -w @traceiq/api
npm run seed -w @traceiq/api
```

The runner reads `DATABASE_URL` and falls back to the local development URL documented in `.env.example`.
Set `DATABASE_SSL=true` for hosted Postgres providers that require SSL.

# Deployment and self-hosting

This guide documents the repository's current, verified deployment shape. It deliberately keeps production database and cache ports private.

## Supported topology

```text
Dashboard host (Vercel or Node.js)
              |
              v
API domain -> host Caddy -> 127.0.0.1:4000
                              |
                         Docker Compose
                         |- NestJS API
                         |- PostgreSQL 18
                         `- Redis 7
```

PostgreSQL uses the PostgreSQL 18 volume layout at `/var/lib/postgresql`. Authentication can use private single-user local mode or Supabase Auth.

## One-command private installation

For a private instance on your own machine:

```bash
docker compose -f compose.local.yml up -d --build
```

Open `http://localhost:3000`. This stack runs migrations automatically and binds the dashboard and API to loopback. It uses `AUTH_MODE=local`, project ID `proj_local`, and development write key `trq_local_development_only`.

Do not expose this configuration through a public proxy. Use Supabase mode for shared or public installations.

## Environment

Copy `.env.example` to `.env` and replace every placeholder needed by your installation. Never commit `.env`.

TraceIQ defaults to unrestricted self-hosted mode. Keep this setting for every
Community deployment, including shared installations using Supabase Auth:

```dotenv
TRACEIQ_DEPLOYMENT_MODE=self_hosted
```

`cloud` is reserved for the TraceIQ-managed service. It enables commercial
plan enforcement and requires complete Bachs billing configuration. Community
installations do not need Bachs credentials and do not call Bachs.

### Session Replay storage

Choose replay object storage independently from the deployment mode:

```dotenv
# Self-hosted and local development
REPLAY_STORAGE_DRIVER=filesystem
TRACEIQ_REPLAY_STORAGE_DIR=/var/lib/traceiq/session-replays
```

The filesystem driver is the self-hosted/local default and does not require any
Supabase replay credential. Persist the directory and grant the API process
read/write access.

TraceIQ Cloud defaults to the Supabase driver. Configure it explicitly before
enabling replay for any project:

```dotenv
REPLAY_STORAGE_DRIVER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
REPLAY_STORAGE_BUCKET=session-replays
```

Keep `SUPABASE_SERVICE_ROLE_KEY` on the API process only; never use a
`NEXT_PUBLIC_*` variable for it. The bucket must already exist and remain
private. Starting the API with replay disabled does not initialize this backend.
Missing values produce a configuration error when replay is enabled or an
enabled project first requests an upload grant.

Flow-targeted Replay requires additive migration
`0032_replay_funnel_targeting.sql` after the existing replay and billing
migrations. It adds project-confined funnel selection/match tables and does not
rewrite existing funnels, replay settings, or replay payloads. Review and apply
it through the normal migration process before deploying code that reads those
tables; no automatic production migration is performed by this change.

In TraceIQ Cloud, Session Replay and Alerts resolve automatically from the
organization plan: Pro has access, Free does not. Self-hosted mode bypasses
these commercial feature gates. Optional zero-valued `sessionReplay` or
`alerts` overrides remain emergency kill switches for Cloud Pro organizations;
positive overrides are not required to provision paid customers.

The API runs a bounded retention sweep every six hours. Self-hosted projects use
their configured `data_retention_days`; TraceIQ Cloud uses the organization's
plan entitlement. Set `RETENTION_SWEEP_INTERVAL_MS` to change the cadence. Event
deletion never reduces the immutable monthly usage counters used for Cloud plan
enforcement.

In Cloud mode, active Bachs subscriptions are reconciled every six hours to
repair missed webhook deliveries. `BILLING_RECONCILIATION_INTERVAL_MS` changes
that cadence; webhook delivery remains the real-time path.

### Bachs sandbox E2E with a local dashboard

Keep the sandbox API and database isolated while exercising the real signed-in
dashboard flow. The public API is also used as a redirect relay because Bachs
does not accept `localhost` as a checkout success URL.

On the temporary API deployment, configure:

```dotenv
TRACEIQ_DEPLOYMENT_MODE=cloud
CORS_ORIGINS=https://traceiq.run,http://localhost:3000,http://127.0.0.1:3000
BILLING_DASHBOARD_RETURN_URL=http://localhost:3000
BILLING_PUBLIC_API_URL=https://billing-test.traceiq.run
```

Use only Bachs sandbox credentials and product IDs there. Configure the Bachs
webhook endpoint as
`https://billing-test.traceiq.run/v1/billing/webhooks/bachs` and subscribe to:

- `checkout.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

`checkout.completed` carries the checkout metadata and safely binds the Bachs
customer/subscription to the TraceIQ organization. The subscription events then
keep its status current.

Point the local dashboard at the temporary API before starting Next.js:

```dotenv
NEXT_PUBLIC_API_URL=https://billing-test.traceiq.run
```

After deploying billing changes, apply all migrations through
`0030_billing_subscription_change_state.sql` to `traceiq_billing_test`, never
the production `traceiq` database. Migration `0029_billing_subscription_period.sql`
must not be edited after application; `0030` is additive on top of it. Then sign in locally, complete Setup, and use
Settings -> Billing -> Upgrade monthly. The success relay returns to
`http://localhost:3000/billing/success`; that page polls briefly for the
authoritative webhook update before confirming that Pro is active. With
`BILLING_DASHBOARD_RETURN_URL=https://traceiq.run`, the same code returns to
`https://traceiq.run/billing/success` in production.

Required for the Compose API stack:

```dotenv
AUTH_MODE=supabase
POSTGRES_PASSWORD=generate-a-unique-password
VPS_DATABASE_URL=postgresql://traceiq:the-same-password@postgres:5432/traceiq
DATABASE_SSL=false
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
CORS_ORIGINS=https://analytics.example.com
DASHBOARD_URL=https://analytics.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
```

`VPS_DATABASE_URL` uses `postgres`, the Compose service hostname. Do not use `localhost` from inside the API container. Set `GROQ_API_KEY`, `RESEND_API_KEY`, and `RESEND_FROM` only when those optional features are required.

The dashboard host needs:

```dotenv
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_WAITLIST_ONLY=false
```

Configure the production dashboard callback URL in Supabase Auth.

## First deployment

From the checked-out repository on the server:

```bash
docker compose up -d postgres redis
docker compose build api
docker compose run --rm api npm run migrate --workspace=@traceiq/api
docker compose up -d api
docker compose ps
curl http://127.0.0.1:4000/health
```

The API image uses Node.js 22 and installs with `--legacy-peer-deps` because the React Native workspace currently has an unrelated peer-dependency conflict.

## Reverse proxy and TLS

The production-tested approach installs Caddy on the VPS host instead of adding a second proxy container:

```caddy
api.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

Point the API DNS record at the VPS, reload Caddy, and verify `https://api.example.com/health`. The Compose API port is bound to `127.0.0.1`; PostgreSQL and Redis do not publish ports to the host.

## Dashboard deployment

Deploy `apps/dashboard` as a Next.js application. The currently verified production arrangement uses Vercel, while local development uses `npm run dev --workspace=@traceiq/dashboard`.

Build it independently with:

```bash
npm ci --legacy-peer-deps
npm run build --workspace=@traceiq/dashboard
```

Set the dashboard environment values on the hosting platform and make sure `CORS_ORIGINS` on the API contains the dashboard origin.

## Safe upgrades

Back up PostgreSQL before migrations or major upgrades. A minimal logical backup is:

```bash
docker compose exec -T postgres pg_dump -U traceiq -d traceiq --no-owner --no-acl > traceiq-backup.sql
```

Store backups outside the Compose volume and test restoration periodically. Then update without tearing down data services:

```bash
git pull --ff-only
docker compose build api
docker compose run --rm api npm run migrate --workspace=@traceiq/api
docker compose up -d api
docker compose ps
curl http://127.0.0.1:4000/health
```

Do not run `docker compose down -v`; the `-v` flag removes the PostgreSQL volume. The historical `migrate-to-vps.sh` script is a one-time Neon migration utility and must not be part of an ordinary deployment.

## Local development

Follow the repository [local quickstart](../README.md#local-quickstart). It uses the same PostgreSQL 18, Redis 7, and API containers while the dashboard runs with the Next.js development server.

## Operational checklist

- Use unique, randomly generated database credentials.
- Keep `.env`, database dumps, access tokens, and event payloads out of Git.
- Expose only the TLS proxy publicly.
- Back up PostgreSQL before migrations and test restores.
- Rotate Supabase, email, AI, and project write keys when exposed.
- Monitor disk usage, API health, database capacity, and container restarts.
- Pin and review dependency and container-image updates.

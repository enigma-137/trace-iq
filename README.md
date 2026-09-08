# TraceIQ

TraceIQ is an open-source, developer-first product analytics platform for web, mobile, and server applications. Capture events with an SDK, explore user journeys and funnels, monitor web and API performance, and run the control plane on infrastructure you own.

> TraceIQ is under active development. Review the configuration and back up your database before operating a public production instance.

## What is included

- Event ingestion and identity stitching
- Web analytics with realtime visitors, referrers, browser/OS breakdowns, UTM campaigns, conversion goals, and reusable filters
- Revocable, permission-scoped public links for saved dashboards
- Error, rage-click, and API-performance analytics
- Feature flags, alerts, webhooks, exports, and organization access controls
- JavaScript, Flutter, React Native, Node.js, Python, Rust, Swift, Kotlin, and PHP SDKs
- An optional MCP server for AI clients

## Architecture

```text
SDKs and applications
        |
        v
NestJS API (apps/api) ---- Redis
        |
        v
PostgreSQL 18
        ^
        |
Next.js dashboard (apps/dashboard)
```

The npm workspaces contain the API, dashboard, browser and server SDKs, shared types, UI primitives, and the MCP server. Additional language SDKs live under `sdks/`; the PHP SDK lives at the repository root.

See [Architecture](docs/architecture.md), [Event schema](docs/event-schema.md), and [Deployment](docs/deployment.md) for more detail.

## Prerequisites

- Node.js 22
- npm 10 or newer
- Docker with Docker Compose
- A Supabase project only when you want accounts, teams, invitations, and 2FA

## Local quickstart

Start a complete private instance with one command:

```bash
docker compose -f compose.local.yml up -d --build
```

Open `http://localhost:3000`. PostgreSQL, migrations, Redis, the API, and dashboard are started automatically. No account or Supabase project is required. The stack creates a local owner, workspace, project, and development write key.

```text
Project ID: proj_local
Write key: trq_local_development_only
API URL: http://localhost:4000
```

Both HTTP ports bind to `127.0.0.1`, and PostgreSQL and Redis are not published. Local mode is designed for a single operator on their own machine—not for a shared or publicly reachable server.

Stop the stack without deleting its data:

```bash
docker compose -f compose.local.yml down
```

For source development with hot reload, install dependencies with `npm ci --legacy-peer-deps`, run the database services from `compose.local.yml`, and configure `AUTH_MODE=local` plus `NEXT_PUBLIC_AUTH_MODE=local` in the respective API and dashboard environments.

Useful checks:

```bash
docker compose ps
curl http://localhost:4000/health
npm run typecheck
npm test --workspace=@traceiq/api
```

## Self-hosting

For accounts, organizations, invitations, and 2FA, use `AUTH_MODE=supabase`. The verified production topology keeps the public dashboard and API deployment independent:

```text
Vercel: Next.js dashboard
DNS: api.example.com -> VPS
VPS host: Caddy -> 127.0.0.1:4000
Docker Compose: API + PostgreSQL 18 + Redis 7
```

For a VPS deployment:

1. Provision Docker, Compose, and Caddy.
2. Clone the repository and create `.env` from `.env.example`.
3. Use unique database credentials and set `VPS_DATABASE_URL` to the Compose hostname `postgres`.
4. Configure the dashboard URL, API URL, CORS origins, and Supabase Auth values for your domains.
5. Start PostgreSQL and Redis, build the API, run pending migrations, then start the API.
6. Reverse proxy the API domain to `127.0.0.1:4000`.
7. Deploy `apps/dashboard` to Vercel or another Node.js host with its `NEXT_PUBLIC_*` variables.

PostgreSQL and Redis do not publish host ports in the provided Compose configuration. The API publishes only `127.0.0.1:4000`. Do not use `docker compose down -v` during upgrades because `-v` deletes the database volume.

Full upgrade, backup, Caddy, and environment guidance is in [docs/deployment.md](docs/deployment.md).

## SDK example

```bash
npm install traceiq-sdk-js
```

```ts
import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: 'https://api.example.com',
  autoTrackPageViews: true
});

traceiq.track('signup_completed', { plan: 'starter' });
```

See the [JavaScript SDK README](packages/sdk-js/README.md),
[Flutter SDK README](packages/sdk-flutter/README.md), and the other
package-specific READMEs for installation details.

## Repository layout

```text
apps/api/              NestJS API, migrations, and tests
apps/dashboard/        Next.js dashboard and public documentation UI
packages/              TypeScript/Flutter SDKs, shared packages, UI, and MCP server
sdks/                  Python, Rust, Swift, and Kotlin SDKs
src/ and tests/        PHP SDK and tests
docs/                  Architecture, deployment, and protocol documentation
infrastructure/        Infrastructure notes and assets
```

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Review [Privacy and data collection](docs/privacy.md) before instrumenting an application. Please report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md), not through a public issue.

TraceIQ is available under the [MIT License](LICENSE).

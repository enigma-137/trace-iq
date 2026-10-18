<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/dashboard/public/brand/logo-white-no-bg.png">
    <img alt="TraceIQ logo" src="apps/dashboard/public/brand/logo-black-no-bg.png" width="96">
  </picture>
</p>

<h1 align="center">TraceIQ</h1>

<p align="center"><b>Open-source product analytics and observability you can run yourself.</b></p>

<p align="center">
  <a href="https://github.com/enigma-137/trace-iq/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/enigma-137/trace-iq/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <a href="https://www.npmjs.com/package/traceiq-sdk-js"><img alt="traceiq-sdk-js on npm" src="https://img.shields.io/npm/v/traceiq-sdk-js?label=traceiq-sdk-js"></a>
  <a href="https://www.npmjs.com/package/traceiq-cli"><img alt="traceiq-cli on npm" src="https://img.shields.io/npm/v/traceiq-cli?label=traceiq-cli"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen"></a>
</p>

<p align="center">
  <a href="https://traceiq.run">Website</a> ·
  <a href="https://traceiq.run/docs">Docs</a> ·
  <a href="https://traceiq.run/docs?page=quickstart">Quickstart</a> ·
  <a href="https://traceiq.run/docs?page=self-hosting">Self-hosting</a> ·
  <a href="packages/usetrace/README.md">CLI</a> ·
  <a href="https://github.com/enigma-137/trace-iq/issues">Report a bug</a>
</p>

<!--
  Demo video: record a short product walkthrough, then edit this file on
  github.com and drag the .mp4 into the editor. GitHub uploads it and inserts a
  https://github.com/user-attachments/assets/... link, which plays inline in the
  README. Put that link on its own line here, in place of the banner below
  (or keep the banner and add the video under it).

<p align="center">
  <a href="https://traceiq.run">
    <img alt="TraceIQ: data that drives real growth" src="apps/dashboard/public/og.png" width="800">
  </a>
</p>
-->


https://github.com/user-attachments/assets/8a11590c-b2b8-49b6-9081-e1de44a17a95





## Every signal about your product, in one place

TraceIQ captures what users do in your web, mobile and server apps, and what your app does back: events, page views, sessions, errors, logs and API calls. You explore it in one dashboard, act on it with flags and experiments, and keep the data on infrastructure you control.

**Analytics**
- [Product analytics](https://traceiq.run/docs?page=features): events, insights, trends, funnels, retention, cohorts and user timelines with identity stitching.
- [Web analytics](https://traceiq.run/docs?page=web-analytics): realtime visitors, referrers, UTM campaigns, goals, journeys and Core Web Vitals.
- [Dashboards](https://traceiq.run/docs?page=dashboards): saved views of any insight, with [permission-scoped public links](https://traceiq.run/docs?page=public-sharing).

**Session replay**
- [Session replay](https://traceiq.run/docs?page=session-replay): consent-aware recordings with privacy controls, linked to the errors and events in each session.

**Observability**
- **Error tracking**: issues grouped by stack trace, with resolve, ignore and assign, and regressions flagged when a fixed issue comes back.
- [Logs](https://traceiq.run/docs?page=logs): structured logs from `traceiq.log()` in the browser and Node SDKs, tied to sessions and requests.
- [API performance](https://traceiq.run/docs?page=api-performance) and a requests explorer: latency, error rates and individual HTTP requests.
- **Synthetic monitors**: scripted checks that run on a schedule or in CI.
- [Alerts](https://traceiq.run/docs?page=alerts): threshold monitors on any metric, delivered by email or webhook.

**Ship and iterate**
- [Feature flags](https://traceiq.run/docs?page=flags): percentage rollouts, targeting and remote config.
- **Experiments** and **surveys**: test changes and ask users directly.

**Data and integrations**
- [Webhooks](https://traceiq.run/docs?page=webhooks) and [data export](https://traceiq.run/docs?page=export) (CSV, JSON, API).
- [HTTP ingestion API](https://traceiq.run/docs?page=ingestion) for any language or platform.

**AI and developer tools**
- **Ask TraceIQ**: ask questions about your data in plain language.
- [MCP server](https://traceiq.run/docs?page=mcp): connect Claude, Cursor or any MCP client to your analytics.
- [CLI](https://traceiq.run/docs?page=cli): set up the SDK, switch projects, pull env vars and tail logs from your terminal.

<details>
<summary><b>Using an AI assistant or agent?</b></summary>

<br>

- Add the MCP server to your client with `npx -y traceiq-mcp-server` and a personal access token from **Settings → Personal access tokens**. Setup for Claude Desktop and Cursor: [MCP docs](https://traceiq.run/docs?page=mcp).
- Agents can drive the CLI non-interactively: `TRACEIQ_TOKEN=tiq_pat_... npx traceiq-cli logs --level error --since 1h --json` prints one JSON object per line. See the [CLI README](packages/usetrace/README.md).
- To instrument an app, run `npx traceiq-cli --project-id <id> --write-key <key> --skip-verify`. It detects Next.js, Vite + React and Node projects.

</details>

## Table of contents

- [Getting started](#getting-started)
  - [TraceIQ Cloud](#traceiq-cloud)
  - [Self-hosting](#self-hosting)
- [Setting up TraceIQ](#setting-up-traceiq)
  - [SDKs](#sdks)
  - [From the terminal](#from-the-terminal)
- [How it works](#how-it-works)
- [Developing TraceIQ](#developing-traceiq)
- [Contributing](#contributing)
- [License](#license)

## Getting started

### TraceIQ Cloud

The hosted version runs at [traceiq.run](https://traceiq.run). Accounts are opened in batches: [request access](https://traceiq.run/waitlist) and you'll get an invite.

### Self-hosting

Run a complete private instance on your own machine with one command. It needs Docker with Compose:

```bash
git clone https://github.com/enigma-137/trace-iq.git && cd trace-iq
docker compose -f compose.local.yml up -d --build
```

Open `http://localhost:3000`. PostgreSQL, Redis, migrations, the API and the dashboard start automatically. No account is needed: the stack creates a local workspace and project.

```text
Project ID: proj_local
Write key:  trq_local_development_only
API URL:    http://localhost:4000
```

Local mode is for one person on their own machine; both ports bind to `127.0.0.1`. For a shared server with accounts, teams, invitations and 2FA, follow the [deployment guide](docs/deployment.md): Docker Compose (API, PostgreSQL 18, Redis 7) behind Caddy, with the dashboard on Vercel or any Node.js host.

> TraceIQ is under active development. Back up your database before upgrading a production instance.

## Setting up TraceIQ

The fastest way is the setup wizard. Run it in your app's folder:

```bash
npx traceiq-cli
```

It detects your framework, installs the SDK, writes your project ID and write key to the env file, and waits until your first event arrives. Or add an SDK yourself:

```bash
npm install traceiq-sdk-js
```

```ts
import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: 'YOUR_PROJECT_ID',
  writeKey: 'YOUR_WRITE_KEY',
  endpoint: 'https://api.traceiq.run',
  autoTrackPageViews: true
});

traceiq.track('signup_completed', { plan: 'starter' });
```

### SDKs

| Frontend | Mobile | Backend |
| --- | --- | --- |
| [JavaScript](packages/sdk-js/README.md) · `traceiq-sdk-js` | [React Native / Expo](packages/react-native/README.md) · `traceiq-react-native` | [Node.js](packages/node/README.md) |
| [Next.js](https://traceiq.run/docs?page=javascript) | [Flutter](packages/sdk-flutter/README.md) | [Python](sdks/python/README.md) · `traceiq-py` |
| [React (Vite)](https://traceiq.run/docs?page=javascript) | [Swift (iOS)](sdks/swift/README.md) | [Rust](sdks/rust/README.md) · `traceiq` |
| | [Kotlin (Android)](sdks/kotlin/README.md) | [PHP](https://traceiq.run/docs?page=php) |

Anything else can send events to the [HTTP API](https://traceiq.run/docs?page=ingestion).

### From the terminal

The same CLI manages your projects once you're set up:

```bash
npx traceiq-cli login                 # paste a personal access token
npx traceiq-cli projects use          # pick a project
npx traceiq-cli env pull              # write TRACEIQ_* vars to .env.local
npx traceiq-cli logs --follow         # stream logs
npx traceiq-cli errors                # list error issues
```

See the [CLI README](packages/usetrace/README.md) for every command.

## How it works

```text
SDKs, CLI, MCP clients
        │
        ▼
NestJS API (apps/api) ── Redis
        │
        ▼
PostgreSQL 18
        ▲
        │
Next.js dashboard (apps/dashboard)
```

More detail: [Architecture](docs/architecture.md) · [Event schema](docs/event-schema.md) · [Privacy and data collection](docs/privacy.md) · [Deployment](docs/deployment.md)

```text
apps/api/              NestJS API, migrations and tests
apps/dashboard/        Next.js dashboard and public docs
packages/              JS, Node, React Native and Flutter SDKs, CLI, MCP server, shared packages
sdks/                  Python, Rust, Swift and Kotlin SDKs
src/ and tests/        PHP SDK
docs/                  Architecture, deployment and protocol docs
```

## Developing TraceIQ

You need Node.js 22, npm 10+ and Docker. Install dependencies, start the database services, and run the API and dashboard with hot reload:

```bash
npm ci --legacy-peer-deps
docker compose -f compose.local.yml up -d postgres redis
```

Set `AUTH_MODE=local` for the API and `NEXT_PUBLIC_AUTH_MODE=local` for the dashboard, then run `npm run dev`. Before opening a pull request:

```bash
npm run typecheck
npm test --workspace=@traceiq/api
npm test --workspace=@traceiq/dashboard
npm run build
```

## Contributing

We'd love your help:

- Open a pull request. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it covers setup, tests and the browser smoke tests.
- [Report a bug or request a feature](https://github.com/enigma-137/trace-iq/issues).
- Found a security issue? Please report it privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## License

TraceIQ is open source under the [MIT License](LICENSE). That covers the whole repository; there is no separate enterprise-licensed code.

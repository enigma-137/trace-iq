# TraceIQ

TraceIQ is a developer-first behavior intelligence platform for web and mobile applications. It is designed to help teams understand user behavior, diagnose conversion issues, and prepare for high-volume analytics workloads.

## Workspace

```text
apps/
  api/          NestJS API and ingestion foundation
  dashboard/    Next.js analytics dashboard
  marketing/    Public marketing site
packages/
  sdk-js/       Browser SDK foundation
  shared/       Shared domain models and utilities
  types/        Cross-package TypeScript contracts
  ui/           Shared UI primitives
docs/           Product, architecture, API, and deployment docs
infrastructure/ Local and future production infrastructure assets
scripts/        Developer automation
```

Start with `docs/architecture.md` and `docs/architecture-diagrams.md` for the system overview.

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run typecheck
npm run dev
```

This foundation intentionally avoids advanced business logic. The current goal is stable architecture, clear contracts, and documentation that future engineers can build on confidently.

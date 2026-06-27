# Architecture

TraceIQ uses a TypeScript monorepo with application code in `apps` and reusable contracts in `packages`.

```text
Browser or mobile app
  -> TraceIQ SDK
  -> API ingestion endpoint
  -> Queue
  -> PostgreSQL event store
  -> Analytics services
  -> Dashboard
```

## Current Foundation

- `apps/api`: NestJS app shell with module boundaries for auth, organizations, projects, events, funnels, analytics, users, replay, AI, and billing. Controllers, services, persistence, and workers are not implemented yet.
- `apps/dashboard`: Next.js preview shell. The authenticated analytics dashboard, project setup, event stream, timelines, and funnels are not implemented yet.
- `apps/marketing`: Next.js marketing site shell.
- `packages/sdk-js`: Browser SDK interfaces and client shell. Event transport, identity/session persistence, enrichment, batching, and retries are not implemented yet.
- `packages/types`: Shared cross-application TypeScript contracts.
- `packages/shared`: Shared helpers derived from domain contracts.
- `packages/ui`: Shared UI primitives.

See `docs/architecture-diagrams.md` for Mermaid diagrams covering the system, ingestion flow, and timeline projection.

## Future Event Storage

PostgreSQL is the initial operational store. ClickHouse should be added when event volume, analytical query cost, or retention requirements exceed the practical limits of PostgreSQL.

## Module Boundaries

Each domain module owns its interfaces and implementation details. Shared packages should contain contracts and helpers only when more than one app or package needs them.

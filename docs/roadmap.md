# TraceIQ Roadmap to v1 MVP

This roadmap defines the path from the current foundation scaffold to a usable v1 MVP. The goal is not to build every promised product surface at once. The goal is to ship a reliable behavior intelligence loop:

```text
Install SDK -> Capture events -> Store clean data -> Explore users and funnels -> Diagnose conversion problems
```

For a shorter friend-facing build plan, see [MVP Collaboration Plan](./mvp-collaboration-plan.md). That plan treats Supabase Auth, organization membership, and project write-key management as part of the first usable MVP slice instead of a later dashboard-only phase.

## MVP Definition

TraceIQ v1 is ready when a real product team can:

- Create an organization and project.
- Install the JavaScript SDK.
- Send `identify`, `track`, `page`, and `group` events from a web app.
- See events arrive in the dashboard within seconds.
- Inspect a user's timeline.
- Build a simple funnel from ordered events.
- See conversion and drop-off by funnel step.
- View basic project health, ingestion volume, and error states.
- Use the product locally or in a single production-like hosted environment.

## Implementation Sync: 2026-06-27

The repository is still in the foundation stage. The current codebase contains the intended monorepo shape and domain boundaries, but most product behavior is not implemented yet.

### Current Codebase State

- Root npm workspaces are configured for `apps/*` and `packages/*`.
- `apps/api` has a NestJS app shell and domain modules for auth, organizations, projects, events, funnels, analytics, users, replay, AI, and billing.
- API modules are currently empty module shells; there are no controllers, services, repositories, migrations, workers, or persisted ingestion endpoints yet.
- `apps/dashboard` is a Next.js app with a coming-soon/preview page, not an authenticated analytics dashboard.
- `apps/marketing` is a minimal Next.js marketing page.
- `packages/sdk-js` exposes `initialize`, `identify`, `track`, `page`, and `group` method shapes, but the browser client does not yet create IDs, persist session state, enrich payloads, batch events, or send network requests.
- `packages/types` contains the initial `TraceIQEvent`, device, network, and timeline contracts.
- `packages/shared` contains a small timeline projection helper.
- `docker-compose.yml` provides local PostgreSQL and Redis services.
- `.env.example` exists and matches the documented local service URLs.

### Verified Gaps

- Docker CLI is not currently available in the local shell, so PostgreSQL and Redis could not be verified with `docker compose ps` from this environment.
- There is no migration runner or first schema migration yet.
- Batch ingestion via `POST /v1/events/batch` is not implemented yet.
- There is no BullMQ queue producer or worker implementation yet.
- There is no dashboard API client, project setup flow, event stream, user list, user timeline, funnel builder, or insight UI yet.
- Plain `git status` is blocked by Git safe-directory ownership configuration in this environment; Git inspection works with a one-off `safe.directory` override.

### Immediate Alignment Target

Before deeper analytics work starts, Phase 0 should produce a clean runnable baseline:

```text
Install -> typecheck -> run API/dashboard/marketing -> run Postgres/Redis -> hit API health endpoint
```

After that, Phase 1 should add migrations and the durable event model, then Phase 2 and Phase 3 should be built together enough to send a real browser event into PostgreSQL.

### Foundation Progress

- `npm install` completes successfully.
- `npm run typecheck` passes across the workspace.
- `npm run build` passes across the workspace.
- `GET /health` returns `200 OK` from the compiled API server.
- Generated TypeScript build info files are ignored by `.gitignore`.
- Plain SQL migrations are selected for the MVP and the initial migration folder exists at `apps/api/migrations`.
- First schema migration exists for organizations, projects, write keys, users, sessions, and events.
- API migration runner exists at `apps/api/scripts/migrate.js`.
- API database module exists for pooled PostgreSQL queries.
- Seed script exists for a default organization, project, and write key.
- `POST /v1/events` exists for single-event ingestion with write-key authentication.
- `GET /v1/events/recent` exists for early event visibility before the dashboard is wired.

## Target Customer Domains

TraceIQ should be shaped around behavior analytics for fintechs, ecommerce teams, and delivery/logistics apps. The platform should stay domain-flexible, but seed data, examples, dashboards, and insight templates should prove value in these three verticals.

### Fintech Journeys

- Signup and onboarding.
- KYC start, submission, review, failure, retry, and approval.
- Wallet funding, transfer initiation, payment attempt, payment failure, and payment success.
- Fraud or risk review states where they affect conversion.

### Ecommerce Journeys

- Product viewed, search performed, product added to cart, checkout started, payment attempted, purchase completed, refund requested, and repeat purchase.
- Cart abandonment and payment failure diagnosis.
- Campaign, coupon, device, and geography segmentation.

### Delivery App Journeys

- Address added, quote viewed, order created, rider assigned, pickup completed, delivery completed, cancellation, failed delivery, and support contact.
- Marketplace matching, fulfilment delay, cancellation, and delivery success diagnostics.
- Customer, merchant, courier, location, and time-window segmentation.

## Guiding Constraints

- TypeScript everywhere.
- PostgreSQL first; ClickHouse later.
- BullMQ for async ingestion and projection work.
- Session replay is scaffolded in v1 but not a required launch feature.
- AI insights use Groq (`llama-3.3-70b-versatile`) to summarize data the app has already computed (e.g. funnel drop-off) — the model explains numbers it's given, it never invents or fetches its own data.
- Billing is account metadata only in v1; no payment enforcement.

## Phase 0: Foundation Stabilization

Status: in progress.

Purpose: turn the scaffold into a runnable developer baseline.

### Deliverables

- Root workspace installs cleanly with `npm install`.
- `npm run typecheck` works across apps and packages.
- Dashboard and marketing apps boot locally.
- API app boots locally.
- Docker Compose starts PostgreSQL and Redis.
- Shared types compile and are consumed by API, dashboard, and SDK.
- Environment setup docs match actual commands.

### Engineering Tasks

- Resolve package TypeScript configuration so root `npm run typecheck` passes with shared package imports.
- Confirm Next.js and NestJS baseline config is complete enough for local development.
- Add ESLint and Prettier config.
- Add package-level `build`, `lint`, and `typecheck` consistency.
- Add basic CI workflow for install, typecheck, lint, and build.
- Add health check endpoint to API. Status: done for `GET /health`.
- Add database migration tool decision and initial migration folder. Status: plain SQL migrations selected under `apps/api/migrations`.
- Add a short current-state script or checklist for verifying API, dashboard, marketing, PostgreSQL, and Redis locally.

### Exit Criteria

- A new engineer can clone, install, run services, and open the dashboard in under 30 minutes.
- CI validates the monorepo baseline.
- No app depends on undocumented manual setup.

## Phase 1: Authenticated Data Model and Persistence

Purpose: create the durable core records and account model that every feature depends on. Authentication, organization membership, and project write-key management should be designed here so the dashboard and SDK do not need to be rewired later.

### Deliverables

- Supabase Auth integration plan for dashboard users.
- `organization_members` table for account-to-organization access.
- Role model for `owner`, `admin`, and `member`.
- PostgreSQL schema for organizations, projects, users, anonymous identities, sessions, events, timeline events, funnels, and funnel steps.
- Migration workflow.
- Database connection module in the API.
- Repository interfaces for event writes and timeline reads.
- Seed script for local development.
- Vertical seed journeys for fintech, ecommerce, and delivery apps.
- Project write-key generation, revoke, and rotate path.

### Core Tables

- `organizations`
- `organization_members`
- `projects`
- `project_write_keys`
- `users`
- `anonymous_identities`
- `sessions`
- `events`
- `timeline_events`
- `funnels`
- `funnel_steps`
- `ingestion_errors`

### Engineering Tasks

- Define IDs and timestamp conventions.
- Map Supabase user IDs to organization memberships.
- Protect dashboard-facing API routes by organization and project membership.
- Add indexes for common queries: project events by time, user timeline by time, session events by time, funnel event lookups.
- Store raw event `properties`, `deviceInfo`, `networkInfo`, and `context` as JSONB.
- Add basic data retention configuration at project level.
- Add local seed data that demonstrates onboarding, KYC, and payment journeys.
- Add local seed data that demonstrates ecommerce checkout and delivery fulfillment journeys.

### Exit Criteria

- Events can be persisted and queried by project, user, session, and time range.
- Dashboard users can only access organizations and projects where they are members.
- SDK ingestion uses project write keys, not Supabase user tokens.
- Timeline projection has a clear storage path.
- Local seed data renders realistic product journeys.

## Phase 2: JavaScript SDK MVP

Purpose: make TraceIQ easy for developers to install and use.

### Deliverables

- Published or locally buildable `@traceiq/sdk-js` package.
- `initialize()` configures project ID, write key, endpoint, batching, and debug mode.
- `identify()` associates events with a user.
- `track()` captures named custom events.
- `page()` captures page views.
- `group()` associates a user with an organization/account.
- Anonymous ID and session ID are generated and persisted in browser storage.
- Event queue supports batching, retry, and unload-safe delivery.

### Engineering Tasks

- Implement browser-safe transport using `fetch` and `sendBeacon` where appropriate.
- Add event enrichment for URL, referrer, title, viewport, user agent, locale, and timezone.
- Add payload validation before sending.
- Add SDK unit tests for identity state, session state, batching, and transport failure handling.
- Add SDK README with install and usage examples.

### Exit Criteria

- A developer can add the SDK to a web app and send events in less than 10 minutes.
- SDK does not crash the host app if TraceIQ is unavailable.
- SDK-generated events match `docs/event-schema.md`.

## Phase 3: Event Ingestion API

Purpose: receive SDK events reliably and safely.

### Deliverables

- `POST /v1/events` endpoint.
- `POST /v1/events/batch` endpoint.
- Write key authentication.
- Request validation and normalization.
- BullMQ ingestion queue.
- Ingestion worker that persists events and timeline projections.
- Ingestion error capture.

### Engineering Tasks

- Validate required event fields.
- Reject invalid write keys and malformed payloads.
- Normalize timestamps and server receive time.
- Add rate limit boundaries per project.
- Add structured API errors.
- Add logging for accepted, rejected, and failed events.
- Add integration tests covering valid event, invalid key, invalid schema, and batch partial failure.

### Exit Criteria

- Valid events sent by the SDK appear in PostgreSQL.
- Invalid events are rejected with useful errors.
- Batch ingestion can accept partial success without losing valid records.
- Ingestion failures are observable in logs and database error records.

## Phase 4: Dashboard Shell and Project Setup

Purpose: give users a usable product surface instead of isolated APIs.

### Deliverables

- Dashboard app layout with navigation for overview, events, users, funnels, settings, and billing placeholder.
- Organization and project creation screens.
- Project settings screen with project ID, write key, allowed origins, and SDK snippet.
- Supabase-backed auth screens and protected dashboard routes.
- Event stream page showing recent events.
- Empty, loading, and error states.

### Engineering Tasks

- Define dashboard API client.
- Add reusable UI primitives in `packages/ui`.
- Add route-level loading and error handling.
- Add server-side or API-backed project context.
- Add responsive layout for desktop and mobile.

### Exit Criteria

- A user can create or seed a project, copy SDK credentials, send events, and see them in the dashboard.
- Dashboard routes are coherent and usable on laptop-sized screens.
- Product setup path is obvious without reading docs.

## Phase 5: User Timelines

Purpose: make individual behavior understandable.

### Deliverables

- Users list with search by user ID and recent activity.
- User profile page.
- Timeline view ordered by occurrence time.
- Timeline event details showing properties, device info, network info, session ID, and raw payload.
- Anonymous-to-identified merge path for events captured before `identify()`.

### Engineering Tasks

- Implement timeline query API.
- Project timeline events during ingestion.
- Add timeline event labels for common lifecycle events.
- Add pagination for long timelines.
- Add tests for identified, anonymous, and merged journeys.

### Exit Criteria

- A product team can inspect the journey of a real user from signup through payment or drop-off.
- Timeline data is queryable without scanning the entire events table.
- Anonymous pre-login behavior is preserved after identification.

## Phase 6: Funnel Analytics MVP

Purpose: provide the first high-value analytics workflow.

### Deliverables

- Funnel creation UI.
- Funnel steps defined by ordered event names.
- Funnel results API.
- Step counts and conversion rates.
- Drop-off rate between steps.
- Time window filter.
- Optional segment filters for simple event properties.

### Engineering Tasks

- Implement PostgreSQL-based funnel computation for MVP scale.
- Support strict ordered funnels within a time window.
- Add indexes or query patterns needed for event sequence lookup.
- Add saved funnel definitions.
- Add tests with seeded journeys.

### Exit Criteria

- A user can define a funnel like `signup_started -> signup_completed -> payment_attempted -> payment_succeeded`.
- Dashboard shows total users, step conversion, and largest drop-off.
- Results are correct against deterministic seed data.

## Phase 7: Conversion Diagnostics v1

Purpose: turn analytics into a clear answer, not just a chart.

### Deliverables

- Rule-based insight generation service.
- Funnel summary cards.
- Highest drop-off step insight.
- Device, browser, or geography comparison when enough data exists.
- Recent anomaly detection using simple baseline comparison.
- Insight records stored for dashboard display.

### Engineering Tasks

- Define insight confidence rules and minimum sample sizes.
- Add background job to generate insights for active projects.
- Add insight API and dashboard section.
- Keep generated explanations deterministic and inspectable.
- Add tests for drop-off, anomaly, and insufficient-data cases.

### Exit Criteria

- The dashboard can answer: "Where is conversion failing most right now?"
- Insights cite the metric or segment that triggered them.
- Low-volume projects show useful insufficient-data states instead of fake certainty.

## Phase 8: Replay Foundation

Purpose: prepare session replay without making it a blocking MVP risk.

### Deliverables

- Replay module remains behind interfaces.
- Replay session metadata table.
- Replay storage adapter interface.
- Dashboard placeholder for replay availability.
- Technical design for rrweb integration.

### Engineering Tasks

- Define replay privacy requirements.
- Define masking defaults for inputs and sensitive fields.
- Design object storage path for replay segments.
- Document replay ingestion flow.

### Exit Criteria

- Replay can be implemented after v1 without rewriting event/session architecture.
- No sensitive replay capture ships accidentally in MVP.

## Phase 9: Production Readiness

Purpose: make the MVP usable outside a developer laptop.

### Deliverables

- Production environment configuration.
- Database migration command.
- API, dashboard, worker, PostgreSQL, and Redis deployment documentation.
- Structured logging.
- Basic monitoring checklist.
- Backup and restore runbook.
- Security checklist.

### Engineering Tasks

- Add environment validation.
- Add API request logging and correlation IDs.
- Add worker failure and retry visibility.
- Add CORS and allowed origin enforcement.
- Add write key rotation path.
- Add database backup documentation.
- Add smoke tests for deployed environment.

### Exit Criteria

- A staging environment can ingest SDK events from a real web app.
- Deployment steps are documented and repeatable.
- Operational failures have a first place to look.

## Phase 10: v1 MVP Release

Purpose: ship the smallest complete product loop.

### Required v1 Features

- Organization and project setup.
- JavaScript SDK.
- Event ingestion.
- Event stream.
- User timelines.
- Funnel creation and funnel results.
- Basic conversion diagnostics.
- Project settings and SDK install snippet.
- Local and hosted deployment documentation.

### Launch Checklist

- SDK documentation is complete.
- API spec matches implemented endpoints.
- Event schema docs match persisted records.
- Dashboard has useful empty states.
- Seed project demonstrates the product.
- Typecheck, lint, build, and tests pass in CI.
- Ingestion failure behavior is tested.
- Funnel calculations are tested against known data.
- Security basics are reviewed: write keys, CORS, input validation, secrets, logs.

### v1 Non-Goals

- ClickHouse production migration.
- Full session replay playback.
- Advanced retention cohorts.
- Full billing and payment collection.
- Enterprise permissions.
- Native mobile SDKs.
- LLM-dependent insights.
- Warehouse exports.

### v1 Success Metrics

- Time to first event: under 10 minutes from project creation.
- Event visibility latency: under 10 seconds in normal local or staging conditions.
- Funnel creation time: under 3 minutes for a user who knows their event names.
- Timeline query latency: under 2 seconds for normal MVP data volumes.
- SDK host-app impact: no unhandled exceptions from failed TraceIQ requests.

## Post-v1 Direction

After v1, prioritize based on user feedback:

- ClickHouse for high-volume analytical storage.
- rrweb-powered session replay.
- Retention analysis and cohort reports.
- Advanced segmentation.
- Team roles and permissions.
- Billing and plan enforcement.
- AI-assisted recommendations with explainable evidence.
- Data exports and warehouse integrations.

# TraceIQ MVP Collaboration Plan

This is the short build plan for someone joining TraceIQ now. It merges authentication into the first usable product slice so we do not build a dashboard that later needs to be rewired around accounts, organizations, and project permissions.

## Product Goal

TraceIQ is a behavior analytics platform for fintech, ecommerce, and delivery teams. The first MVP should let a real team install a JavaScript SDK, send browser events, and see those events in a dashboard quickly.

The core product loop is:

```text
Create account -> Create project -> Copy SDK snippet -> Track events -> View users, sessions, and funnels
```

## Technical Direction

- Keep the MVP backend in TypeScript/NestJS so the API, dashboard, SDK, and shared types stay in one language.
- Use Supabase Auth for dashboard login and user sessions.
- Use managed Postgres for the MVP. Neon can stay as the app database for now; Supabase Postgres is also viable if we later want auth and data in one provider.
- Use plain SQL migrations for now.
- Use project write keys for SDK ingestion.
- Avoid a separate Python backend service until there is a clear reason to split the system.

A Python-oriented collaborator can still help a lot by owning database design, SQL queries, API behavior, auth rules, data validation, and analytics logic while implementing those pieces in the existing TypeScript API.

## What Already Works

- PostgreSQL schema migration exists for organizations, projects, project write keys, users, sessions, and events.
- Neon Postgres has been tested with the migration and seed scripts.
- API health endpoints exist: `GET /health` and `GET /health/db`.
- Single-event ingestion exists: `POST /v1/events`.
- Recent event visibility exists: `GET /v1/events/recent`.
- Write-key authentication works for SDK/event ingestion.
- The JavaScript SDK has a working `track()` path.
- A dashboard demo page can import the SDK, send a browser event, and display recent events from the database.
- Recent events now include the original external user ID so the dashboard can show IDs like `user_123` or `demo_user_...`, not only internal database IDs.

## MVP Definition

The MVP is ready for private testing when a user can:

- Sign in to the dashboard.
- Create or join an organization.
- Create a project.
- Generate, view, revoke, and rotate a project write key.
- Copy an SDK snippet.
- Install the SDK on a real browser website.
- Send `identify`, `track`, `page`, and `group` events.
- See live events in the dashboard.
- Open a user profile and inspect that user's event timeline.
- Build a simple funnel from ordered events.

## Phase 1: Authenticated Browser Install MVP

Goal: make the first real end-to-end product path work. Auth belongs here, not later.

### Dashboard Auth

- Use Supabase Auth for dashboard users.
- Add sign up, sign in, sign out, and session handling in the dashboard.
- Keep Supabase tokens only in the dashboard/API auth flow.
- Do not put Supabase tokens in the browser SDK.

### Organizations and Permissions

- Add an `organization_members` migration.
- Store each dashboard user as a member of one or more organizations.
- Support basic roles for now: `owner`, `admin`, and `member`.
- Protect dashboard APIs so users can only access organizations and projects they belong to.

### Project and API Key Management

- Add project creation in the dashboard.
- Add project settings with project ID, write key, allowed origins, and SDK snippet.
- Generate project write keys on the API.
- Store hashed write keys before private beta. If the earliest local MVP temporarily stores plain seeded keys, document that clearly and remove it before inviting external users.
- Support write key revoke and rotate.

### SDK Ingestion

- Keep SDK ingestion authenticated by project write key.
- Validate `projectId` against the write key.
- Accept real browser events from an external test site.
- Add basic payload limits and useful error responses.

### Event Visibility

- Show recent events for the selected project.
- Show both internal user ID and external user ID where available.
- Add simple filters for event name, external user ID, and time range if time allows.

### Phase 1 Exit Criteria

- A user can create an account with Supabase Auth.
- A user can create an organization and project.
- A user can copy a project ID and write key from the dashboard.
- A user can install the SDK on a test website.
- A button click or signup event from that website lands in Postgres.
- The event appears in the dashboard within seconds.
- Dashboard reads require user auth.
- SDK writes require a valid project write key.

## Phase 2: Core Analytics Surfaces

Goal: turn raw events into useful product analytics.

- Event explorer with filters.
- User list with search by external user ID.
- User profile and timeline.
- Session view.
- Simple project overview metrics.
- Funnel creation with ordered event steps.
- Funnel results with conversion and drop-off.

## Phase 3: Private Beta Hardening

Goal: make the product safe enough for a few real teams.

- Enforce allowed origins for browser SDK requests.
- Add rate limits per project/write key.
- Add ingestion error records and dashboard visibility.
- Add request validation for event and batch payloads.
- Add `POST /v1/events/batch`.
- Add logging and basic monitoring.
- Add deployment docs for API, dashboard, and database.
- Review secrets, CORS, logs, and write key storage.

## Suggested Backend Focus

A backend/database collaborator would be most useful on:

- Supabase Auth integration in the NestJS API.
- Organization membership and project authorization.
- SQL migrations and indexes.
- Write key generation, hashing, revoke, and rotate.
- Event repository/query layer.
- User timeline queries.
- Funnel query implementation.
- Ingestion validation, rate limits, and error capture.

## Suggested Frontend Focus

The dashboard/frontend work should stay close to the live product loop:

- Auth pages.
- Organization/project setup.
- SDK install snippet.
- Recent events page.
- User timeline page.
- Funnel builder MVP.

## Near-Term Build Order

1. Add Supabase Auth to dashboard and API.
2. Add `organization_members` migration and authorization checks.
3. Build authenticated organization/project setup.
4. Build project write key management.
5. Replace the SDK demo with a real project setup and recent events page.
6. Test SDK install from a separate browser website.
7. Add user timeline.
8. Add funnel MVP.

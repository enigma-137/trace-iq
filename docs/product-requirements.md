# Product Requirements

## MVP Scope

- Capture events from JavaScript applications.
- Associate events with organizations, projects, users, sessions, and anonymous visitors.
- Display user timelines from captured events.
- Define funnels using ordered event names.
- Prepare storage and interfaces for replay metadata.
- Generate structured insight records from analytics findings in a future release.

## Non-Goals For Foundation

- Full funnel computation.
- Session replay recording and playback.
- AI model integration.
- Billing enforcement.
- Multi-region infrastructure.

## Core User Stories

- As a developer, I can install the SDK and send `track`, `identify`, `page`, and `group` calls.
- As a product manager, I can inspect a user's journey as a timeline.
- As a growth team member, I can define a funnel and eventually see drop-off by step.
- As an engineer, I can reason about modules and contracts without reading every app.

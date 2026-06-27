# Product Requirements

## MVP Scope

- Capture events from JavaScript applications.
- Associate events with organizations, projects, users, sessions, and anonymous visitors.
- Display user timelines from captured events.
- Define funnels using ordered event names.
- Prepare storage and interfaces for replay metadata.
- Generate structured insight records from analytics findings in a future release.

## Primary Customer Domains

TraceIQ should support general product analytics, but MVP examples and workflows should focus on three early customer domains:

- Fintech: onboarding, KYC, wallet funding, transfers, payment attempts, failed payments, fraud/risk review, and conversion recovery.
- Ecommerce: product discovery, cart behavior, checkout, payment success/failure, purchase completion, refunds, coupons, and repeat buying.
- Delivery apps: order creation, rider/courier assignment, pickup, delivery completion, cancellation, failed delivery, fulfilment delays, and support contact.

## MVP Product Loop

The first complete product loop should be:

```text
Create project -> install SDK -> send events -> view live event stream -> inspect user timeline -> build funnel -> diagnose drop-off
```

This loop should work with realistic seed data for fintech, ecommerce, and delivery scenarios before broader analytics features are added.

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
- As a fintech team, I can find where users fail onboarding, KYC, funding, or payment flows.
- As an ecommerce team, I can find where shoppers abandon discovery, cart, checkout, or repeat purchase flows.
- As a delivery team, I can find where orders stall, fail, cancel, or create support load.

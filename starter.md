# PROJECT FOUNDATION SETUP

You are a Staff Software Engineer and Solutions Architect.

We are building **TraceIQ**, a developer-first behavior intelligence platform for web and mobile applications.

## Product Vision

TraceIQ helps product teams understand:

* What users do
* Where users drop off
* Why conversions fail
* Which journeys lead to retention
* How payments, onboarding, and key flows perform

The platform combines:

1. Event Tracking
2. Funnel Analytics
3. User Timelines
4. Session Replay
5. Conversion Intelligence
6. AI-Powered Insights

Target customers:

* Fintechs
* Edtechs
* Food delivery platforms
* SaaS products
* Growth-stage startups

---

# Architecture Principles

Follow these principles:

* Monorepo architecture
* TypeScript everywhere
* Modular design
* Domain-driven folder structure
* Production-ready foundations
* Clear documentation
* Future support for millions of events

---

# Tech Stack

Frontend:

* Next.js
* TypeScript
* Tailwind CSS
* Shadcn UI

Backend:

* NestJS
* TypeScript

Database:

* PostgreSQL

Future:

* ClickHouse for event storage

Queue:

* BullMQ

Infrastructure:

* Docker
* Docker Compose

---

# Create Monorepo Structure

Create:

/apps
/dashboard
/api
/marketing

/packages
/sdk-js
/shared
/ui
/types

/docs

/infrastructure

/scripts

---

# Dashboard Module Structure

Create folders:

dashboard/
src/
app/
components/
features/
analytics/
funnels/
replay/
users/
organizations/
billing/
settings/
hooks/
lib/
services/
types/

---

# Backend Module Structure

api/
src/
modules/
auth/
organizations/
projects/
events/
funnels/
analytics/
users/
replay/
ai/
billing/

```
common/
  decorators/
  guards/
  filters/
  interceptors/

database/
queue/
config/
```

---

# SDK Structure

sdk-js/
src/
core/
transport/
replay/
analytics/
types/

Provide starter interfaces for:

* initialize()
* identify()
* track()
* page()
* group()

Example:

traceiq.track("signup_completed", {
plan: "premium"
})

---

# Documentation

Create documentation files:

docs/

vision.md
architecture.md
product-requirements.md
event-schema.md
api-spec.md
sdk-spec.md
deployment.md
roadmap.md

Populate each file with detailed starter content.

---

# Event System

Design an event model supporting:

Event:

* id
* organizationId
* projectId
* userId
* sessionId
* eventName
* properties
* deviceInfo
* networkInfo
* timestamp

Ensure schema is extensible.

---

# User Timeline

Design a timeline system capable of displaying:

User Registered
↓
Email Verified
↓
KYC Started
↓
KYC Failed
↓
Payment Attempted
↓
Payment Failed

Store timeline-ready data from day one.

---

# Analytics Foundation

Prepare architecture for:

* Event ingestion
* Funnel generation
* Retention analysis
* Segmentation
* Conversion diagnostics

Do not fully implement.

Create interfaces and documentation.

---

# Session Replay Foundation

Create replay module scaffolding.

Use abstraction layers so rrweb can be integrated later.

Do not implement replay logic yet.

---

# AI Insights Foundation

Create architecture and interfaces for:

Insight Generation Service

Future examples:

* Highest drop-off step
* Retention anomalies
* Conversion bottlenecks
* Device-specific issues

Only create interfaces and documentation.

---

# Developer Experience

Create:

* README.md
* CONTRIBUTING.md
* ENVIRONMENT_SETUP.md

Include setup commands and local development instructions.

---

# Deliverables

1. Complete monorepo structure
2. Folder scaffolding
3. TypeScript interfaces
4. Documentation
5. Architecture diagrams in markdown
6. Initial event schema
7. Development workflow documentation

Do not implement advanced business logic yet.

Focus entirely on creating a scalable foundation that future engineers can build upon confidently.

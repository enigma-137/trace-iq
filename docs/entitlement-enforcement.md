# Entitlement enforcement

The browser is never authoritative for billing. Cloud plan state is resolved from the latest persisted `subscriptions` row by `EntitlementService`; client-supplied plan names, limits and usage values are ignored. `TRACEIQ_DEPLOYMENT_MODE=self_hosted` bypasses the Cloud checks.

| Entitlement | Authoritative protection | Concurrency / defense in depth |
| --- | --- | --- |
| Monthly events | `EventsService` calls `UsageService.consume` in the same transaction as the event insert. Single and batch ingestion share this path. | PostgreSQL transaction advisory lock on `organization:events`, followed by the counter check and atomic upsert. Ingestion stops at 105%; 70/90/100 warnings are surfaced in Billing. |
| Projects | Organization create, setup and project-create transactions call `EntitlementService.lockAndAssertAvailable`. | PostgreSQL transaction advisory lock on `organization:projects` serializes the count and insert. Excess projects retained after downgrade are read-only through `assertProjectWritable`. |
| Members | Add, invite and invite-accept flows call the organization seat check. | PostgreSQL transaction advisory lock on `organization:members` serializes active-member plus pending-invite capacity. Excess memberships are retained and restricted after downgrade. |
| AI insights | `AiService` reserves usage before calling the model provider. | `UsageService.consume` locks `organization:aiInsights` and increments atomically, preventing concurrent paid model calls from crossing quota. |
| Retention | Migration `0027_event_retention_access_policy.sql` applies a forced PostgreSQL row-level SELECT policy to `events`. | Cloud connections receive a server-controlled deployment-mode setting. Old rows are invisible at query time even before `RetentionService` physically deletes them. Self-hosted connections bypass the policy. |
| Public dashboards | Allowed on both plans by the canonical plan catalogue. | Public queries use the same database connection and therefore the same retention policy. |
| Bachs subscription | Webhook state, provider product, and `monthly`/`yearly` billing period are persisted in `subscriptions`; checkout metadata is mapped server-side. | Provider events are idempotent and ordered by provider event time. The first `past_due` grace deadline is preserved rather than extended by later events. |

Count limits are checked immediately before writes inside the same transaction. Database advisory locks are used instead of process-local locks, so the guarantees hold across multiple API replicas and direct API/SDK/curl requests.

## Deployment checklist

1. Apply migrations through `0027` to the target database.
2. Set `TRACEIQ_DEPLOYMENT_MODE=cloud` only for TraceIQ Cloud API processes.
3. Verify the Bachs webhook rows and resulting subscription in the same database used by the API.

## Billing periods and plan changes

Both paid products map to the internal `pro` plan. The billing period is never
inferred from `plan_key`; it is mapped from the allowlisted Bachs product ID and
persisted as `subscriptions.billing_period`.

- Monthly Pro is `$19/month`.
- Yearly Pro is `$190/year`.
- A monthly-to-yearly change updates the existing Bachs subscription with
  `PATCH /v1/subscriptions/{id}` using the yearly `product_id` and
  `proration_behavior=invoice_now`.
- TraceIQ never creates a second checkout/subscription for that change. An
  organization-scoped transaction lock, a stable provider idempotency key, and
  a partial unique database index prevent overlapping nonterminal Bachs
  subscriptions.

Bachs applies the product change immediately and generates the proration invoice
for the current period. Subsequent webhook delivery remains authoritative and
periodic reconciliation repairs a missed webhook.
4. Exercise Free, Pro, past-due grace and downgrade flows before replacing sandbox credentials.

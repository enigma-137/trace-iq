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
| Session Replay | Self-hosted is unrestricted; Cloud Pro is available by plan and Cloud Free is rejected. Project enablement remains a separate switch. | Config, upload authorization, every chunk, and completion recheck entitlement, consent, deterministic sampling, and a server-derived current funnel match. A zero override is an emergency kill switch. Downgrade never deletes historical payloads. |
| Alerts | Self-hosted is unrestricted; Cloud Pro can create, enable, evaluate, and deliver; Cloud Free cannot. | The API gates creation/activation/testing, the background evaluator gates before work, and delivery rechecks immediately before managed email/webhook I/O. Downgrade preserves definitions while suppressing execution and delivery. |
| Bachs subscription | Webhook state, provider product, and `monthly`/`yearly` billing period are persisted in `subscriptions`; checkout metadata is mapped server-side. | Provider events are idempotent and ordered by provider event time. The first `past_due` grace deadline is preserved rather than extended by later events. |

Count limits are checked immediately before writes inside the same transaction. Database advisory locks are used instead of process-local locks, so the guarantees hold across multiple API replicas and direct API/SDK/curl requests.

## Deployment checklist

1. Apply migrations through `0030` to the target database. Migration `0029`
   owns the persisted billing period and one-subscription constraint; additive
   migration `0030` owns asynchronous subscription-change state.
2. Set `TRACEIQ_DEPLOYMENT_MODE=cloud` only for TraceIQ Cloud API processes.
3. Verify the Bachs webhook rows and resulting subscription in the same database used by the API.
4. Before enabling flow-targeted Replay, review and apply additive migration `0032_replay_funnel_targeting.sql`. It adds only project-confined funnel selection/match tables and supporting unique indexes; it does not rewrite funnel or replay data.

## Billing periods and plan changes

Both paid products map to the internal `pro` plan. The billing period is never
inferred from `plan_key`; it is mapped from the allowlisted Bachs product ID and
persisted as `subscriptions.billing_period`.

- Monthly Pro is `$9/month` (`BACHS_PRO_MONTHLY_PRODUCT_ID`).
- Yearly Pro is `$90/year` (`BACHS_PRO_YEARLY_PRODUCT_ID`), shown as
  `$7.50/month` and "2 months free" (17% less than 12 monthly payments).
- Retired Pro products stay recognized through
  `BACHS_PRO_LEGACY_MONTHLY_PRODUCT_IDS` and `BACHS_PRO_LEGACY_YEARLY_PRODUCT_IDS`
  (comma-separated). Existing subscribers on those products keep Pro
  entitlements, renew at the amount Bachs bills them, and receive webhooks,
  cancellations, and reconciliation exactly like current products. New
  checkouts and monthly-to-yearly changes always use the current products.
  When retiring a product, move its ID from the current variable into the
  matching legacy variable; never remove it while a subscriber still uses it.
- A monthly-to-yearly interval change updates the existing Bachs subscription
  with `PATCH /v1/subscriptions/{id}` using only the yearly `product_id`.
  `proration_behavior` is deliberately omitted: Bachs schedules a different
  billing interval for the subscription's next renewal instead of creating an
  immediate prorated invoice.
- This is separate from same-interval plan or price changes. The Bachs client
  still accepts an explicit `proration_behavior: "invoice_now"` for those
  changes; TraceIQ does not apply it to billing-interval changes.
- TraceIQ never creates a second checkout/subscription for that change. An
  organization-scoped transaction lock, a stable provider idempotency key, and
  a partial unique database index prevent overlapping nonterminal Bachs
  subscriptions.
- A successful PATCH means only that Bachs accepted the schedule. TraceIQ keeps
  the persisted monthly product, monthly entitlements, and renewal boundary,
  while exposing that yearly billing is scheduled.
- Only a signed `customer.subscription.updated` event that reports the target
  yearly product changes the persisted billing period to `yearly`. Payment or
  invoice success events never synthesize subscription state.
- At renewal, Bachs normally emits `invoice.paid` followed by
  `customer.subscription.updated`. TraceIQ records the invoice event
  idempotently but waits for the signed subscription event before changing the
  stored product or period.
- A failed renewal follows the ordinary `past_due` and seven-day grace flow. It
  does not invent a successful yearly transition or turn the scheduled change
  into an immediate-upgrade payment failure.
- A signed cancellation or terminal subscription update clears a scheduled
  local change that can no longer take effect. Bachs does not currently
  document a separate public API for canceling only a scheduled interval
  change, so TraceIQ does not invent one.

Signed provider webhook delivery is authoritative. Periodic reconciliation may
refresh ordinary subscription state, but it intentionally cannot finalize a
scheduled interval change or advance the signed-provider-event clock.

4. Exercise Free, Pro, pending/failed plan changes, past-due grace and downgrade flows before replacing sandbox credentials.

# Session Replay

TraceIQ Session Replay records rrweb event streams; it never creates video files. The feature is disabled by default and uses this flow:

`Browser SDK -> rrweb -> transport sanitizer -> short-lived upload grant -> replay API -> server sanitizer -> private object storage`

PostgreSQL stores only settings, ownership, indexes, retention state, counts, sizes, checksums, and server-generated object keys. rrweb payloads are sanitized, gzipped, and kept outside PostgreSQL.

## Privacy and consent

The safe default is **Strict** with replay consent required. Strict masks every form input and all visible text. Balanced still masks every form input but preserves ordinary visible text. Custom adds customer selectors without disabling permanent credential/payment protections.

The SDK recognizes `data-traceiq-mask`, `data-traceiq-block`, and `data-traceiq-ignore`. `data-traceiq-ignore` suppresses interaction events only and **is not a privacy control**; use masking or blocking for privacy. Hidden and visible inputs, known password/card/CVV/OTP/credential surfaces, URL credentials, sensitive query values, fragments, and obvious secrets in text are sanitized before transport and again before persistence.

All iframes are blocked by default. A customer may explicitly mark a reviewed same-origin frame with `data-traceiq-allow-replay="true"`; the SDK verifies its origin and rejects known authentication/payment URLs and sensitive form contents before temporarily marking it recordable. Cross-origin iframe recording remains disabled even if a page is misconfigured. Canvas and font collection are disabled. Blocked content is omitted from outgoing and stored events; it is not merely blurred in the player.

```ts
traceiq.initialize({
  projectId: 'proj_...',
  writeKey: 'trq_...',
  replay: { enabled: true, requireConsent: true }
});

// Connect these calls to your CMP/cookie-consent system.
traceiq.grantReplayConsent();
traceiq.revokeReplayConsent();
```

When consent is required, rrweb is not imported or initialized before `grantReplayConsent()`. A monotonic lifecycle epoch is checked after each asynchronous boundary and immediately before recorder startup or upload. Revocation advances the epoch, aborts requests, stops capture, and discards pending events. Chunks committed before revocation remain subject to the configured replay retention period, manual deletion, and data-subject deletion workflow.

Customers remain responsible for determining a lawful basis, notices, consent requirements, retention, and data-subject handling. Masking does not by itself make a deployment compliant with GDPR, CCPA, or any other law.

## Storage

Replay storage is selected with `REPLAY_STORAGE_DRIVER=filesystem|supabase`. Self-hosted and local processes default to `filesystem`; TraceIQ Cloud defaults to `supabase`. Set the driver explicitly in deployed environments to make the intended backend unambiguous.

With `REPLAY_STORAGE_DRIVER=supabase`, the API requires `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, and `REPLAY_STORAGE_BUCKET`. Keys are generated and syntax-validated by the API under an organization/project/session prefix; browsers cannot choose keys or receive the service-role credential. Never expose that credential through a `NEXT_PUBLIC_*` variable. Playback is server-mediated after normal organization/project authorization.

With `REPLAY_STORAGE_DRIVER=filesystem`, the adapter is rooted at `TRACEIQ_REPLAY_STORAGE_DIR` (default `.traceiq/session-replays` outside the supplied Compose configuration) and does not read or require Supabase replay credentials. The supplied Compose files mount the configured path on a persistent named volume. The `ReplayStorage` interface isolates storage calls so another self-hosted adapter can be supplied without any Cloud dependency.

Storage adapters initialize lazily. Merely starting the API, loading disabled replay settings, or rejecting replay for lack of a Cloud entitlement does not validate or contact the selected backend. When an operator enables replay, or an enabled project requests an upload grant, the API checks the selected backend immediately and returns a clear configuration error if its required values are unavailable.

Self-hosted operators can lower the built-in safety ceilings with `REPLAY_MAX_REQUEST_BYTES`, `REPLAY_MAX_COMPRESSED_CHUNK_BYTES`, `REPLAY_MAX_UNCOMPRESSED_CHUNK_BYTES`, `REPLAY_MAX_EVENTS_PER_CHUNK`, `REPLAY_MAX_CHUNKS_PER_SESSION`, `REPLAY_MAX_SESSION_BYTES`, `REPLAY_MAX_UNCOMPRESSED_SESSION_BYTES`, `REPLAY_MAX_PLAYBACK_PAGE_BYTES`, and `REPLAY_MAX_DURATION_SECONDS`.

## Required manual setup

1. Review and apply `apps/api/migrations/0028_session_replay.sql` manually in a maintenance window. Do not run it from an application process. The migration has a five-second lock timeout, a five-minute statement timeout, and a preflight that aborts on existing cross-project session/user rows. Its composite indexes on existing parent tables can still consume time and disk; rehearse against a production-sized copy and monitor lock waits before deployment.
2. In TraceIQ Cloud's Supabase project, create a **private** bucket named by `REPLAY_STORAGE_BUCKET`. Do not add public read policies. The API service role performs object operations after TraceIQ authorization.
3. Set `REPLAY_STORAGE_DRIVER=supabase`, `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `REPLAY_STORAGE_BUCKET`, and `REPLAY_UPLOAD_TOKEN_SECRET` (32+ random characters) on Cloud API processes. Never expose server credentials through `NEXT_PUBLIC_*` variables.
4. For self-hosted mode, set `REPLAY_STORAGE_DRIVER=filesystem`, set and persist `TRACEIQ_REPLAY_STORAGE_DIR`, and ensure the API user can read/write it. No Supabase replay credential is required.
5. Apply explicit Cloud `entitlement_overrides` before enabling replay. No Free/Pro replay allowance is assumed by this implementation.

### Rollback and failed deployment

There is intentionally no automatic destructive down migration. Before application rollout, back up the schema and record the migration transaction outcome. Because PostgreSQL runs `0028` transactionally, a lock timeout, failed preflight, or failed constraint validation rolls back the file. If an operator must remove the feature later, first disable replay for every project, stop replay workers, delete private objects through the application cleanup path, export `replay_deletion_audit` if required, and only then remove replay tables/constraints in a separately reviewed change. Dropping `0028` objects directly is data-destructive and can orphan storage objects.

## Retention and deletion

Ingestion first reserves an `uploading` row, writes the object, and finalizes counters under the same replay lock used by deletion. The retention worker reconciles stale reservations/orphans before deleting expired replays. It deletes private objects first, marks each chunk deletion, then marks replay metadata deleted/expired. Failures retain retryable state and an audit-friendly attempt/error record. Foreign keys use `RESTRICT` for organizations, projects, and sessions so owners must call `ReplayService.deleteForOrganization`, `deleteForProject`, or `deleteForSubject` before relational deletion; this fails closed rather than orphaning objects.

## Operational limits and logging

The API uses server receipt time for expiration, bounds browser clock skew, validates event ranges on ingestion and completion, and atomically enforces chunk count plus compressed and expanded replay totals under the replay lock. Gzip expansion has a hard output ceiling. Playback is paginated by chunk and expanded-byte budget. Before returning an event, the API replaces recorded network URLs and CSS imports with inert values; the dashboard replay route adds a restrictive CSP and rrweb's iframe remains sandboxed without script execution. Logs contain replay IDs, sequence numbers, byte counts, and failure categories only—never DOM content or input values.

Cloud entitlements support feature availability, monthly sessions, monthly storage bytes, maximum sample rate, maximum retention, and maximum duration. Self-hosted mode bypasses Cloud billing while retaining the safety and storage limits.

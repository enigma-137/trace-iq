# Linear integration

TraceIQ connects one Linear workspace per organization. Issues are created by the
**TraceIQ app** (OAuth `actor=app`), not by the person who connected, and TraceIQ
only asks for `read,write,issues:create`. It never asks for `admin`.

Each project picks a default Linear team (and optionally a label) for new issues.

## 1. Create the Linear OAuth application

In Linear, go to **Settings → API → OAuth applications → New application**:

| Field | Value |
| --- | --- |
| Name | `TraceIQ` (this is the author name shown on issues) |
| Callback URL | `https://<your-api>/v1/integrations/linear/callback` |
| Developer URL | Your TraceIQ dashboard URL |
| Public | Enable if organizations outside your own Linear workspace will connect |

TraceIQ sends the scopes itself (`read,write,issues:create`, `actor=app`). You do
not need to set them on the app.

### Webhook (keeps errors in sync)

On the same OAuth application, turn on **Webhooks**:

| Field | Value |
| --- | --- |
| Webhook URL | `https://<your-api>/v1/integrations/linear/webhook` |
| Resource types | **Issues** |

Copy the app's webhook **signing secret** into `LINEAR_WEBHOOK_SECRET`. An app-level
webhook covers every workspace that connects, so nothing is registered per organization.
Without it, issues are still created but closing them in Linear does not resolve the error.

## 2. Configure the API

```bash
LINEAR_CLIENT_ID=...            # from the Linear OAuth app
LINEAR_CLIENT_SECRET=...        # from the Linear OAuth app; also signs the OAuth state
LINEAR_REDIRECT_URL=            # optional; defaults to $TRACEIQ_PUBLIC_API_URL/v1/integrations/linear/callback
LINEAR_WEBHOOK_SECRET=          # the OAuth app's webhook signing secret; enables status sync
TRACEIQ_SECRET_ENCRYPTION_KEY=  # required on Cloud; encrypts stored Linear tokens (AES-256-GCM)
DASHBOARD_URL=https://traceiq.run  # where the callback sends the browser afterwards
```

The redirect URL configured in Linear must exactly match the one the API uses.
Rotating `LINEAR_CLIENT_SECRET` invalidates connect links that are still in flight,
but not existing connections. Rotating `TRACEIQ_SECRET_ENCRYPTION_KEY` makes stored
tokens unreadable, so every organization would have to reconnect.

Run the migrations (`0064_linear_integration.sql`, `0065_error_linear_issues.sql`,
`0066_linear_sync_and_auto_create.sql`) with
`npm run migrate -w @traceiq/api`.

Once configured, owners and admins connect from **Settings → Integrations** in the dashboard
and pick a default team (and optional label) for each project.

## API

All routes are under `/v1/integrations/linear`. Dashboard routes need a signed-in
session. The organization is picked with `?organizationId=` or `?projectId=`; when
neither is given, the person's first organization is used.

| Route | Who | What |
| --- | --- | --- |
| `GET /connect` | owner/admin | Returns `{ url, expiresAt }`: the Linear authorize URL with a signed state that lasts 10 minutes |
| `GET /callback` | Linear redirect | Checks the state's signature and forwards the browser to `/dashboard/settings/integrations?linear=complete&linear_code=…&linear_state=…` (or `?linear=error&reason=…`). It does **not** exchange the code |
| `POST /complete` | the person who started | `{ code, state }` from the forward. Requires the signed-in user to be the user in the state, re-checks owner/admin, exchanges the code and stores the encrypted token |
| `GET /status` | any member (`projects:read` for PATs) | `not_connected`, `active` or `needs_reconnect`, plus the workspace, teams and per-project defaults |
| `GET /teams/:teamId/labels` | any member | Labels for that team, plus workspace-wide labels |
| `DELETE /` | owner/admin | Revokes the token with Linear (best effort) and removes the connection and project defaults |
| `PUT /projects/:projectId` | owner/admin | `{ teamId, labelId? }`, checked against the connected workspace |

Values for the `reason` on a callback error: `cancelled`, `expired`, `invalid_state`,
`missing_code`, `linear_error`, `not_configured`. `POST /complete` fails with these codes:
`LINEAR_STATE_INVALID`, `LINEAR_STATE_EXPIRED`, `LINEAR_STATE_USER_MISMATCH`, `LINEAR_CODE_INVALID`.

### Why the callback does not finish the connection

The callback is a browser redirect from Linear with no TraceIQ session, so it cannot tell
who is in the browser. If it finished the connection itself, an attacker could start a
connection for their own organization and send the Linear link to a victim; if the victim
approved, the victim's Linear workspace would be connected to the attacker's organization.
Finishing in the dashboard with the signed-in session, and requiring that it is the same
person who started, closes that hole. The dashboard removes the code from the address bar
before posting it.

### Creating issues from errors

`POST /v1/dashboard/errors/issues/:id/linear-issue` with `{ projectId }` (`:id` is the error
issue's fingerprint; PATs need `errors:write`). It creates an issue in the project's default
team with the configured label. The title is the error type and message. The description
holds the stack trace (source-mapped when available, cut to 30 lines), occurrences and
affected users over the last 90 days, first and last seen, environment and release when
known, and a link back to TraceIQ. Error text is kept inside code fences, because it comes
from end users' devices.

The link is stored in `error_linear_issues`. Calling again returns the stored link
(`created: false`) instead of a second issue; a per-error lock covers double clicks.
Errors: `LINEAR_NOT_CONNECTED` (404), `LINEAR_NEEDS_RECONNECT` (409), `LINEAR_TEAM_NOT_SET`
(409), `LINEAR_ERROR` (502). The dashboard sends the first three to Settings → Integrations.
`GET /v1/dashboard/errors/issue` includes `issue.linearIssue` once one exists.

Creation is guarded by a short-lived claim row (`error_linear_issue_claims`): only one
request or API instance talks to Linear for an error at a time, without holding a
database connection while Linear responds. A second caller gets the finished link, or
`LINEAR_ISSUE_IN_PROGRESS` (409) if the first is still working. Claims left by a crash
expire after five minutes.

### Status sync (webhook)

`POST /v1/integrations/linear/webhook` checks `Linear-Signature` (hex HMAC-SHA256 of the
raw body with `LINEAR_WEBHOOK_SECRET`) and rejects deliveries whose `webhookTimestamp` is
more than 60 seconds away from the server clock. Then, for `Issue` create/update events:

- Moving the linked issue to a **completed** or **canceled** state resolves the error.
  Ignored errors stay ignored.
- Moving it back out of done reopens a resolved error.
- The error shows "Synced from Linear" until someone changes its status in TraceIQ.
- Unlinked issues, other event types, and events from a workspace other than the one the
  issue was created in are acknowledged and ignored.
- Each link remembers the last Linear `updatedAt` it applied, so retries and
  out-of-order deliveries never undo a newer change.

### Auto-create (opt-in)

Per project, in the Linear card: **Create issues automatically** with an occurrences
threshold, an affected-users threshold, or both. An error qualifies when it reaches
**either** (counted over the last 90 days). It is off by default.

Ingestion calls the check after the events are written and does not wait for it; it
never throws into ingestion. Each error is checked at most once a minute per API
instance, a project's rule is cached for 30 seconds (so a change can take that long to
apply), and the claim row above prevents duplicate issues across instances. Ignored
errors and errors that already have an issue are skipped. Issues created this way are
stored with `created_via = 'auto'` and no `created_by_user_id`.

Personal access tokens cannot connect, disconnect or change Linear settings.

## Token handling

- Access and refresh tokens are stored encrypted (`v1.<iv>.<tag>.<ciphertext>`) and
  are never returned by the API or written to logs.
- Expiring tokens are refreshed shortly before they expire. If Linear rejects a
  token and a refresh cannot fix it, the connection is marked `needs_reconnect`.
  The dashboard should then offer "Reconnect", which runs the same connect flow.
- If an organization reconnects to a **different** Linear workspace, its project
  defaults are cleared because team ids belong to a workspace.

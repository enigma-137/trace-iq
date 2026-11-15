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

## 2. Configure the API

```bash
LINEAR_CLIENT_ID=...            # from the Linear OAuth app
LINEAR_CLIENT_SECRET=...        # from the Linear OAuth app; also signs the OAuth state
LINEAR_REDIRECT_URL=            # optional; defaults to $TRACEIQ_PUBLIC_API_URL/v1/integrations/linear/callback
TRACEIQ_SECRET_ENCRYPTION_KEY=  # required on Cloud; encrypts stored Linear tokens (AES-256-GCM)
DASHBOARD_URL=https://traceiq.run  # where the callback sends the browser afterwards
```

The redirect URL configured in Linear must exactly match the one the API uses.
Rotating `LINEAR_CLIENT_SECRET` invalidates connect links that are still in flight,
but not existing connections. Rotating `TRACEIQ_SECRET_ENCRYPTION_KEY` makes stored
tokens unreadable, so every organization would have to reconnect.

Run the migrations (`0064_linear_integration.sql`, `0065_error_linear_issues.sql`) with
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

Personal access tokens cannot connect, disconnect or change Linear settings.

## Token handling

- Access and refresh tokens are stored encrypted (`v1.<iv>.<tag>.<ciphertext>`) and
  are never returned by the API or written to logs.
- Expiring tokens are refreshed shortly before they expire. If Linear rejects a
  token and a refresh cannot fix it, the connection is marked `needs_reconnect`.
  The dashboard should then offer "Reconnect", which runs the same connect flow.
- If an organization reconnects to a **different** Linear workspace, its project
  defaults are cleared because team ids belong to a workspace.

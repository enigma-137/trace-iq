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

Run the migration (`0064_linear_integration.sql`) with `npm run migrate -w @traceiq/api`.

## API

All routes are under `/v1/integrations/linear`. Dashboard routes need a signed-in
session. The organization is picked with `?organizationId=` or `?projectId=`; when
neither is given, the person's first organization is used.

| Route | Who | What |
| --- | --- | --- |
| `GET /connect` | owner/admin | Returns `{ url, expiresAt }`: the Linear authorize URL with a signed state that lasts 10 minutes |
| `GET /callback` | Linear redirect | Checks the state, exchanges the code, stores the encrypted token, and redirects to `/dashboard/settings/integrations?linear=connected` or `?linear=error&reason=…` |
| `GET /status` | any member (`projects:read` for PATs) | `not_connected`, `active` or `needs_reconnect`, plus the workspace, teams and per-project defaults |
| `GET /teams/:teamId/labels` | any member | Labels for that team, plus workspace-wide labels |
| `DELETE /` | owner/admin | Revokes the token with Linear (best effort) and removes the connection and project defaults |
| `PUT /projects/:projectId` | owner/admin | `{ teamId, labelId? }`, checked against the connected workspace |

Values for the `reason` on a callback error: `cancelled`, `expired`, `invalid_state`,
`forbidden`, `invalid_code`, `missing_code`, `linear_error`, `not_configured`.

Personal access tokens cannot connect, disconnect or change Linear settings.

## Token handling

- Access and refresh tokens are stored encrypted (`v1.<iv>.<tag>.<ciphertext>`) and
  are never returned by the API or written to logs.
- Expiring tokens are refreshed shortly before they expire. If Linear rejects a
  token and a refresh cannot fix it, the connection is marked `needs_reconnect`.
  The dashboard should then offer "Reconnect", which runs the same connect flow.
- If an organization reconnects to a **different** Linear workspace, its project
  defaults are cleared because team ids belong to a workspace.

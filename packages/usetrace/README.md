# traceiq-cli

Set up TraceIQ in your app and manage your projects from the terminal.

```bash
npx traceiq-cli            # setup wizard
npx traceiq-cli help       # all commands
```

Installed globally (`npm i -g traceiq-cli`), the same binary is also available as `traceiq`.
The examples below use `traceiq`; with `npx`, use `npx traceiq-cli` in its place.

Full guide: [traceiq.run/docs?page=cli](https://traceiq.run/docs?page=cli).

## Quick start

```bash
npx traceiq-cli                 # 1. instrument your app (first time only)
traceiq login                   # 2. paste a personal access token
traceiq projects use            # 3. pick the project to work with
traceiq env pull                # 4. write its env vars into this repo
traceiq logs --follow           # 5. watch logs while you develop
```

## Setup wizard

| Command | What it does |
| --- | --- |
| `traceiq` | Detects your framework, installs the SDK, writes env vars and waits for the first event |
| `traceiq audit` | Checks the instrumentation already in the project (alias `doctor`) |
| `traceiq verify` | Waits for a live event using the project ID and write key in your `.env` |

Wizard flags: `--project-id`, `--write-key`, `--api-url`, `--timeout <seconds>`, `--dry-run`, `--skip-verify`, `--probe`.

## Log in

Management commands use a **personal access token**. Create one in the dashboard under
**Settings → Personal access tokens** with these scopes:

| Scope | Used by |
| --- | --- |
| `projects:read` | `projects list`, `projects use`, `whoami` |
| `analytics:read` | `logs`, `status` |
| `errors:read` | `errors` |

```bash
traceiq login                       # prompts for the token (input hidden)
traceiq login --token tiq_pat_...   # non-interactive
traceiq whoami
traceiq logout
```

The token and the active project are saved to `~/.traceiq/config.json`, readable only by
you. In CI, set `TRACEIQ_TOKEN` instead of logging in.

## Projects

```bash
traceiq projects list
traceiq projects use              # pick from a list
traceiq projects use my-app       # by id, slug or name
```

Every data command uses the active project. Override it for one run with `--project <id>`.

## Env files

```bash
traceiq env pull                  # updates .env.local (or .env / .env.development if present)
traceiq env pull --file .env      # pick the file
traceiq env pull --print          # print instead of writing
traceiq env pull --write-key trq_...
```

`env pull` writes `TRACEIQ_PROJECT_ID`, `TRACEIQ_API_URL` and, when known, `TRACEIQ_WRITE_KEY`,
with the prefix your framework needs (`NEXT_PUBLIC_` for Next.js, `VITE_` for Vite, none for
Node; force one with `--framework next|vite|node`). Other lines in the file are kept.

Write keys are stored hashed, so the API cannot return them. `env pull` keeps the key already
in your env file when it belongs to the same project; otherwise pass `--write-key`.

## Logs, events and errors

```bash
traceiq logs                              # last hour, oldest first
traceiq logs --level error --since 24h
traceiq logs -s checkout --follow         # stream new logs until Ctrl+C
traceiq logs --trace 4bf92f35... --json   # one JSON object per line

traceiq events --follow
traceiq events --name signup_completed -n 50

traceiq errors --days 30
```

| `logs` flag | |
| --- | --- |
| `-l, --level` | `debug`, `info`, `warn`, `error` |
| `-s, --search` | Matches message, route, service, trace/request id, user id |
| `--source` | `api`, `sdk`, `ai`, `webhook`, `job`, ... |
| `--status` | `success`, `warning`, `error` (comma-separated for several) |
| `--trace` | Logs for one trace |
| `--since` | `15m`, `2h`, `7d` or an ISO date (default `1h`) |
| `-n, --limit` | First page size (default 50, max 200) |
| `-f, --follow` | Poll for new entries (`--interval <seconds>`, default 2) |
| `--json` | Newline-delimited JSON |

Logs written with `traceiq.log()` in the browser and Node SDKs show up here.

## Status and dashboard

```bash
traceiq status            # API health, last event, last log, event counts
traceiq open              # dashboard overview
traceiq open logs         # also: events, errors, users, web, api, flags, replays, alerts, settings, billing, team
traceiq open logs --print # just print the URL
```

`status` exits with code 1 when the API is unreachable, so it works as a CI check.

## Not available from the CLI

The API only accepts a signed-in dashboard session (not a personal access token) for:

- creating, renaming or deleting projects
- showing or rotating write keys

The CLI explains this and points you to `traceiq open settings` when you try them.

## Global flags and environment

| Flag | Env | Default |
| --- | --- | --- |
| `--api-url <url>` | `TRACEIQ_API_URL` | `https://api.traceiq.run` |
| `--token <tiq_pat_...>` | `TRACEIQ_TOKEN` | saved by `login` |
| `-p, --project <id>` | | saved by `projects use` |
| `--dashboard-url <url>` | `TRACEIQ_DASHBOARD_URL` | derived from the API URL |
| | `TRACEIQ_CONFIG_DIR` | `~/.traceiq` |

Flags win over environment variables, which win over the saved config. For a local stack,
log in with `traceiq login --api-url http://localhost:4000`; the dashboard URL then defaults
to `http://localhost:3000`.

## Scripting

Every data command takes `--json`. `logs` and `events` print one JSON object per line, so
they work with `jq` and survive `--follow`:

```bash
traceiq logs --level error --since 24h --json | jq -r '.message' | sort | uniq -c | sort -rn
traceiq events --follow --json | jq 'select(.eventName == "purchase_completed")'
traceiq projects list --json | jq -r '.[].id'
traceiq status --json || echo "TraceIQ API is down"
```

Exit codes: `0` on success, `1` on any error (bad token, missing scope, unreachable API,
unknown command). Pressing Ctrl+C while `--follow` waits for new data exits with `0`.

## Troubleshooting

| Message | Fix |
| --- | --- |
| `Not logged in.` | Run `traceiq login`, or set `TRACEIQ_TOKEN`. |
| `The API rejected your token` | The token was revoked, expired or mistyped. Create a new one and log in again. |
| `Personal access token requires "analytics:read" scope.` | Create a token with that scope (the CLI names the one it needs) and log in again. |
| `Project ... not accessible with this token.` | The saved project was deleted or belongs to another account. Run `traceiq projects use`. |
| `Could not reach the TraceIQ API` | Check `--api-url` / `TRACEIQ_API_URL`, and that a local API is running. |
| `env pull` leaves out the write key | Write keys can't be read back from the API. Pass `--write-key`, or copy it from the dashboard when you create or rotate it. |

`traceiq whoami` shows which API, token (masked) and project the CLI is using, and where each
came from.

## Development

```bash
npm run build      # tsc → dist/
npm run typecheck
npm test           # vitest
```

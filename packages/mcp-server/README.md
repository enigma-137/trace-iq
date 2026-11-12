# TraceIQ MCP Server

The official Model Context Protocol (MCP) server for TraceIQ.

Connect AI assistants like Claude Desktop, Cursor, VS Code, and other MCP-compatible clients directly to your TraceIQ workspace. Ask questions about product usage, funnels, retention, errors, feature flags, and user behavior in natural language.

The server provides secure, scope-based access to your analytics and includes intelligent tools that summarize and explain your data instead of simply exposing raw API responses.

---

## Features

- 📊 Analytics overview and web traffic insights
- 📈 Event trends and retention analysis
- 🎯 Funnel exploration and AI-powered drop-off summaries
- 👤 User timelines and behavior inspection
- 🐞 Error monitoring and issue investigation
- 🚩 Feature flag management
- 🚨 Alert management
- 🧠 High-level analytics tools that explain changes in plain English
- 🔒 Personal Access Token (PAT) scope enforcement
- ⚡ Automatic retries, request timeouts, and LLM-friendly response shaping

---

## Remote server (no install)

TraceIQ hosts the server at:

```
https://api.traceiq.run/mcp
```

Add it as a custom connector (Claude: Settings → Connectors → Add custom connector; ChatGPT,
Cursor and VS Code have the same option). The app opens TraceIQ, you sign in and choose whether it
may only read or also make changes, and you're connected. No token to copy.

The connection is a personal access token named after the app (for example "Claude (connected
app)"). It lasts 90 days and you can revoke it any time under Settings → Personal access tokens.

Clients that only take a URL plus a header can also send an existing token:
`Authorization: Bearer tiq_pat_...`.

### Self-hosting the remote server

`traceiq-mcp-http` (or `node dist/http.js`) serves Streamable HTTP. Put it behind your proxy at
`/mcp` and `/.well-known/oauth-protected-resource*` on the API's host; the TraceIQ API is the OAuth
authorization server.

| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on (default `8787`) |
| `TRACEIQ_API_URL` | The API, as the MCP server reaches it (e.g. `http://api:4000`) |
| `TRACEIQ_MCP_PUBLIC_URL` | Public URL of the endpoint (e.g. `https://api.traceiq.run/mcp`) |
| `TRACEIQ_OAUTH_ISSUER` | Public URL of the API (defaults to the endpoint's origin) |
| `TRACEIQ_DASHBOARD_URL` | Dashboard for "Open in TraceIQ" links |

The API needs `TRACEIQ_PUBLIC_API_URL` (its public URL, the OAuth issuer) and `DASHBOARD_URL`
(where the consent page lives).

---

## Installation (local, stdio)

```bash
npm install -g traceiq-mcp-server
```

Or run directly with:

```bash
npx traceiq-mcp-server
```

---

## Configuration

Set the following environment variables:

```bash
TRACEIQ_API_KEY=tiq_pat_your_token_here
TRACEIQ_API_URL=http://localhost:4000
TRACEIQ_MCP_TIMEOUT_MS=30000
TRACEIQ_MCP_RETRIES=2
TRACEIQ_PROJECT_ID=
TRACEIQ_DASHBOARD_URL=
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TRACEIQ_API_KEY` | ✅ | Personal Access Token used to authenticate requests |
| `TRACEIQ_API_URL` | No | TraceIQ API URL (defaults to `http://localhost:4000`) |
| `TRACEIQ_MCP_TIMEOUT_MS` | No | Request timeout in milliseconds |
| `TRACEIQ_MCP_RETRIES` | No | Number of retries for transient failures |
| `TRACEIQ_PROJECT_ID` | No | Project used when a tool call names none (otherwise the token's first project) |
| `TRACEIQ_DASHBOARD_URL` | No | Where "Open in TraceIQ" links point (defaults to the API URL without `api.`) |

---

## Authorization

Every MCP tool requires one or more Personal Access Token scopes.

Create tokens with only the permissions your AI client actually needs.

Examples:

| Scope | Allows |
|-------|--------|
| `projects:read` | View projects |
| `analytics:read` | Analytics dashboards |
| `insights:read` | Events, trends, retention |
| `funnels:read` | Inspect funnels |
| `funnels:write` | Create, update, and delete funnels |
| `users:read` | User profiles and timelines |
| `errors:read` | Error monitoring |
| `alerts:read` | View alerts |
| `alerts:write` | Manage alerts |
| `flags:read` | View feature flags |
| `flags:write` | Toggle feature flags |
| `errors:write` | Resolve, ignore or reopen error issues |
| `replays:read` | List session replays |
| `dashboards:read` / `dashboards:write` | View dashboards / create dashboards and widgets |
| `experiments:read` / `experiments:write` | Experiment results / create, start, pause or finish experiments |
| `surveys:read` / `surveys:write` | Survey results / publish, pause or close surveys |
| `cohorts:read` / `cohorts:write` | View / create and delete cohorts |
| `synthetic_monitors:read` / `synthetic_monitors:write` | Monitor runs / run, pause and resume monitors |
| `webhooks:read` / `webhooks:write` | Webhook deliveries / retry deliveries and send test events |

Read-only tokens cannot perform mutations.

---

# Available Tools

## Projects and account

- `list_projects`
- `whoami`: who the token belongs to, its scopes, its projects, and the tools it cannot use

---

## Analytics

- `get_analytics_overview` (optional `range`: `24h`, `7d` or `30d`; default `7d`)
- `get_web_analytics`
- `get_api_performance`

---

## Insights

- `list_event_names`
- `get_trends`
- `get_retention`

---

## Funnels

- `list_funnels`
- `get_funnel`
- `get_funnel_results`
- `get_funnel_step_users`
- `summarize_funnel_dropoff`

---

## Users

- `list_users`
- `get_user`
- `get_user_timeline`

---

## Errors

- `list_error_issues`
- `get_error_issue`
- `update_error_issue` (resolve, ignore or reopen; needs `errors:write`)

---

## Incidents and debugging

- `get_today_story`: the plain-English story of the last 24 hours, including whether the backend recovered
- `get_project_health`: operational, degraded, outage or idle, from recent data
- `investigate_incident`: health, failing endpoints, error logs, top issues and replays for one window, with next steps
- `search_logs` / `get_log`: search log lines and follow a trace
- `search_requests` / `get_request`: captured API requests, with timeline and related requests
- `list_replays`: session replays for a user, visitor or session (needs `replays:read`)

---

## Feature Flags

- `list_feature_flags`
- `toggle_feature_flag`

---

## Alerts

- `list_alerts`
- `create_alert`
- `set_alert_enabled`
- `delete_alert`

---

## Short Links

- `list_links`
- `get_link_stats`
- `create_link`

---

## AI Intelligence Tools

These tools combine multiple TraceIQ endpoints to answer higher-level product questions.

- `explain_conversion_drop`
- `summarize_api_health`
- `show_retention_changes`
- `find_users_who_failed_checkout`

Rather than returning raw API payloads, these tools generate concise, structured summaries designed for AI assistants.

---

## Ad-hoc queries

- `run_insight_query`: any trend (count, unique, sum or average of an event, broken down by a property), top events, retention, funnel, web, API or error report, with filters and a custom window

---

## Dashboards

- `list_dashboards`, `get_dashboard`
- `create_dashboard`, `add_dashboard_widget` (from a saved insight or a new one)

---

## Experiments and surveys

- `list_experiments`, `get_experiment_results`, `create_experiment`, `set_experiment_status`
- `list_surveys`, `get_survey_results`, `set_survey_status`

---

## Cohorts

- `list_cohorts`, `create_cohort`, `delete_cohort`

---

## Synthetic monitors

- `list_synthetic_monitors`, `get_synthetic_monitor_runs`
- `run_synthetic_monitor`, `set_synthetic_monitor_paused`

---

## Webhooks

- `list_webhooks`, `list_webhook_deliveries`
- `retry_webhook_delivery`, `test_webhook`

---

## Prompts

The server also ships prompts, which clients such as Claude show as slash commands:

| Prompt | What it does |
|--------|--------------|
| `incident-review` | Finds what is broken (or was), who it hit, the likely cause and next actions |
| `daily-standup` | A short summary of the last 24 hours for the team standup |
| `weekly-report` | Usage, conversion, retention, reliability and errors for the week |
| `experiment-readout` | Which variant is winning, by how much, and whether to ship it |
| `funnel-audit` | Where users drop out of a funnel, who they are, and what to fix |

---

## Resources

Clients that support MCP resources can attach these as context without a tool call:

| Resource | Contents |
|----------|----------|
| `traceiq://projects` | Projects the token can see |
| `traceiq://me` | The same account summary as `whoami` |
| `traceiq://tools` | Every tool and the scopes it needs |
| `traceiq://projects/{projectId}/event-names` | Event names tracked in a project |
| `traceiq://projects/{projectId}/funnels` | Saved funnels |
| `traceiq://projects/{projectId}/dashboards` | Custom dashboards |

---

## Results and links

Tool results come back as JSON text and as `structuredContent`. When there is a matching page in the
TraceIQ dashboard, the result also carries an **Open in TraceIQ** `resource_link` (and
`_links.dashboard` in the structured content), with the project kept selected.

---

## Safety

Mutating tools require explicit write scopes.

Destructive operations are annotated so MCP clients can distinguish them from read-only tools.

In clients that support elicitation, the server also asks you to confirm before it deletes a funnel,
alert or cohort, toggles a feature flag, or changes an experiment's or survey's status. If you decline,
nothing is changed.

When a call fails for lack of a scope, the error names the scopes the tool needs and where to create a
token that has them (Settings → Personal access tokens).

Administrative operations such as:

- Organization management
- Write key regeneration
- Personal Access Token management

are intentionally **not exposed** through the MCP server.

---

# Claude Desktop

```json
{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "https://api.traceiq.run"
      }
    }
  }
}
```

---

## Example Questions

Once connected, you can ask:

- "Why did conversions drop yesterday?"
- "Show me the users who abandoned checkout."
- "Which API endpoints have the highest latency?"
- "Summarize our retention over the past eight weeks."
- "What are the top events this month?"
- "Are any feature flags currently enabled?"
- "Explain this funnel's biggest drop-off."

The MCP server combines TraceIQ's analytics with AI reasoning to provide concise, actionable answers instead of raw dashboard data.

# TraceIQ MCP Server

![npm](https://img.shields.io/npm/v/traceiq-mcp-server)
![npm downloads](https://img.shields.io/npm/dm/traceiq-mcp-server)
![License](https://img.shields.io/npm/l/traceiq-mcp-server)
![Node](https://img.shields.io/node/v/traceiq-mcp-server)
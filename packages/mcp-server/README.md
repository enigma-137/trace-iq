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

## Installation

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
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TRACEIQ_API_KEY` | ✅ | Personal Access Token used to authenticate requests |
| `TRACEIQ_API_URL` | No | TraceIQ API URL (defaults to `http://localhost:4000`) |
| `TRACEIQ_MCP_TIMEOUT_MS` | No | Request timeout in milliseconds |
| `TRACEIQ_MCP_RETRIES` | No | Number of retries for transient failures |

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

Read-only tokens cannot perform mutations.

---

# Available Tools

## Projects

- `list_projects`

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

## AI Intelligence Tools

These tools combine multiple TraceIQ endpoints to answer higher-level product questions.

- `explain_conversion_drop`
- `summarize_api_health`
- `show_retention_changes`
- `find_users_who_failed_checkout`

Rather than returning raw API payloads, these tools generate concise, structured summaries designed for AI assistants.

---

## Safety

Mutating tools require explicit write scopes.

Destructive operations are annotated so MCP clients can distinguish them from read-only tools.

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
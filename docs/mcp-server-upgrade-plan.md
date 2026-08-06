# TraceIQ MCP Server Upgrade — Plan & Deliverables

The MCP server grew from 3 tools (`list_projects`, `list_feature_flags`, `toggle_feature_flag`)
into a production-grade analytics copilot. This document records the capability audit, the
chosen tool map, the authorization changes, and the phased plan. The implementation itself
lives in `packages/mcp-server/src/` and the API authorization changes in `apps/api/src/modules/`.

---

## 1. API capability audit

Source of truth: `apps/api/src/modules/**/*.controller.ts`. Every dashboard controller previously
authenticated via `AuthService.getDashboardUser()` but only **flags** and **projects** enforced a
scope. The audit classifies every surface and identifies which are safe for autonomous AI use.

### Safety legend
- **Read** — no data mutation; safe for autonomous AI.
- **Requires confirmation** — creates/updates a resource; acceptable with an explicit write scope.
- **Destructive** — permanent deletion.
- **Administrative** — credential/org-level; intentionally **excluded** from MCP.

### Module inventory (scope enforcement added this change)

| Module | Class | Path | Reads | Writes | Scope added |
|---|---|---|---|---|---|
| analytics | `AnalyticsController` | `/v1/dashboard` | overview, web, api-performance, event-names, trends, retention | — | `analytics:read`, `insights:read` |
| funnels | `FunnelsController` | `/v1/dashboard/funnels` | list, get, results, step-users | create, update, delete | `funnels:read` / `funnels:write` |
| ai | `AiController` | `/v1/dashboard/ai/funnels/:id/summary` | funnel summary (read-only POST) | — | `funnels:read` |
| users | `UsersController` | `/v1/dashboard/users` | list, get, timeline | — | `users:read` |
| errors | `ErrorsController` | `/v1/dashboard/errors` | issues, issue detail | — | `errors:read` |
| alerts | `AlertsController` | `/v1/dashboard/alerts` | list | create, setEnabled, test, delete | `alerts:read` / `alerts:write` |
| cohorts | `CohortsController` | `/v1/dashboard/cohorts` | list | create, delete | `cohorts:read` / `cohorts:write` |
| webhooks | `WebhooksController` | `/v1/dashboard/webhooks` | list | create, test, update, delete | `webhooks:read` / `webhooks:write` |
| export | `ExportController` | `/v1/dashboard/export/events` | raw event export | — | `exports:read` |
| flags | `FlagsController` | `/v1/dashboard/flags` | list | create, update, delete (already) | (unchanged) `flags:read`/`flags:write` |
| projects | `ProjectsController` | `/v1/dashboard/projects` | list | — | (unchanged) `projects:read` |
| organizations | `OrganizationsController` | `/v1/setup` | setup status | bootstrap, write-key regenerate | **excluded** (administrative) |
| auth | `PersonalAccessTokensController` | `/v1/dashboard/personal-access-tokens` | list | create, revoke | **excluded** (`requireSupabaseSession`) |
| billing / replay | — | — | placeholder modules, no routes | — | — |

**Key gap closed:** previously a PAT scoped to `projects:read, flags:read` could still mutate
funnels, alerts, webhooks, and cohorts, and read analytics — because no other controller checked
scopes. Every surface now enforces an explicit, least-privilege scope.

---

## 2. Recommended MCP tool map

All tools are declarative and centralized in `packages/mcp-server/src/tools.ts`. Each carries a
human `title`, `annotations` (readOnly/destructive/idempotent hints), typed `inputSchema`, `requiredScopes`,
and a handler. All tools are non-mutating unless noted.

### Read-only — analytics & insights
| Tool | Required scope | Backing endpoint |
|---|---|---|
| `get_analytics_overview` | `analytics:read` | `GET /v1/dashboard/overview` |
| `get_web_analytics` | `analytics:read` | `GET /v1/dashboard/web` |
| `get_api_performance` | `analytics:read` | `GET /v1/dashboard/api-performance` |
| `list_event_names` | `insights:read` | `GET /v1/dashboard/insights/event-names` |
| `get_trends` | `insights:read` | `GET /v1/dashboard/insights/trends` |
| `get_retention` | `insights:read` | `GET /v1/dashboard/retention` |

### Read-only — funnels
| Tool | Scope | Backing endpoint |
|---|---|---|
| `list_funnels` | `funnels:read` | `GET /v1/dashboard/funnels` |
| `get_funnel` | `funnels:read` | `GET /v1/dashboard/funnels/:id` |
| `get_funnel_results` | `funnels:read` | `GET /v1/dashboard/funnels/:id/results` |
| `get_funnel_step_users` | `funnels:read` | `GET /v1/dashboard/funnels/:id/users` |
| `summarize_funnel_dropoff` | `funnels:read` | `POST /v1/dashboard/ai/funnels/:id/summary` (Groq LLM) |

### Read-only — errors & users
| Tool | Scope | Backing endpoint |
|---|---|---|
| `list_error_issues` | `errors:read` | `GET /v1/dashboard/errors` |
| `get_error_issue` | `errors:read` | `GET /v1/dashboard/errors/issue` |
| `list_users` | `users:read` | `GET /v1/dashboard/users` |
| `get_user` | `users:read` | `GET /v1/dashboard/users/:id` |
| `get_user_timeline` | `users:read` | `GET /v1/dashboard/users/:id/timeline` (shaped) |
| `list_feature_flags` | `flags:read` | `GET /v1/dashboard/flags` |
| `list_alerts` | `alerts:read` | `GET /v1/dashboard/alerts` |

### Composed / intent tools (Step 6)
These compose several endpoints into a single, plain-language answer instead of exposing raw REST:

| Tool | Scopes | Composes |
|---|---|---|
| `explain_conversion_drop` | `funnels:read`, `analytics:read` | funnel results + web analytics → biggest drop-off step + traffic delta + interpretation |
| `summarize_api_health` | `analytics:read` | api-performance → verdict, error rate, slowest / error-prone / busiest endpoints |
| `show_retention_changes` | `insights:read` | retention → cohorts + plain-language retention note |
| `find_users_who_failed_checkout` | `funnels:read`, `users:read` | funnel + step users → users dropped at the final step |

### Guarded mutations (Step 9 — only after authorization)
| Tool | Scope | Hint |
|---|---|---|
| `toggle_feature_flag` | `flags:write` | idempotent, reversible |
| `create_funnel` | `funnels:write` | non-destructive |
| `update_funnel` | `funnels:write` | non-destructive |
| `delete_funnel` | `funnels:write` | **destructive** |
| `create_alert` | `alerts:write` | non-destructive |
| `set_alert_enabled` | `alerts:write` | idempotent, reversible |
| `delete_alert` | `alerts:write` | **destructive** |

**Deliberately NOT exposed** (organizational / credential / irreversible): organization setup
and write-key regeneration, personal-access-token management, webhook & cohort management
(deferred until a business need), raw event export (too large for model context).

---

## 3. Required authorization changes (implemented)

In `apps/api/src/modules/auth/personal-access-tokens.service.ts` the scope whitelist was expanded:

```
projects:read, flags:read, flags:write,
analytics:read, insights:read,
funnels:read, funnels:write,
users:read, cohorts:read, cohorts:write,
errors:read, alerts:read, alerts:write,
webhooks:read, webhooks:write, exports:read
```

`AuthService.requireScope(user, scope)` was already PAT-only (a no-op for Supabase sessions) —
we reused it and wired it into every dashboard controller. MCP tools document their **minimum**
scope in `requiredScopes`, and read-only PATs therefore get no write capability.

---

## 4. MCP architecture (implemented)

- `src/client.ts` — one centralized HTTP client: Bearer auth, JSON encoding, **timeouts**
  (`TRACEIQ_MCP_TIMEOUT_MS`, default 30s), **retries with exponential backoff** for 408/429/5xx
  (`TRACEIQ_MCP_RETRIES`, default 2), centralized error decoding, and **arbitrary HTTP methods**.
- `src/validate.ts` — schema-driven argument validation (types, required, enums, defaults,
  unknown-field rejection) with helpful error messages.
- `src/shape.ts` — response shaping: truncates long arrays with a `__truncated` marker, clips
  long strings, collapses deep nesting, compacts user timelines, summarizes large lists. Lets the
  MCP server ship concise, context-friendly answers instead of raw JSON.
- `src/tools.ts` — the declarative tool registry + composed-tool logic.
- `src/index.ts` — server bootstrap, `ListTools` (emits `annotations` + `requiredScopes`) and
  `CallTool` dispatch through the validator + handler + shaping pipeline.

### Ergonomics
- Every tool gets a title, a description written for an LLM, typed inputs with sensible defaults,
  and `annotations.readOnlyHint` / `destructiveHint` / `idempotentHint`.
- Enums constrain intervals (`hour|day|week`), measures (`count|unique|sum|avg`), and alert
  conditions (`above|below|drops_by|spikes_by`).

---

## 5. Phased implementation plan

1. **Authorize** — add new scopes; call `requireScope()` in every dashboard controller. ✅
2. **Centralize client** — timeouts, retries, methods, auth, errors, shaping. ✅
3. **Read-only analytics/insights tools.** ✅
4. **Funnel + AI-summary tools.** ✅
5. **User intelligence tools** (timeline simplified to concise feed). ✅
6. **Composed intent tools** (`explain_conversion_drop`, etc.). ✅
7. **Guarded mutations** with write scopes + destructive hints. ✅
8. **Docs & build verification.** In progress.

Future work: expose webhook and cohort management behind their write scopes if a business case
appears; add `outputSchema` for typed tool results; stream tool progress for long AI summaries.
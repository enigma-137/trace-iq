# Changelog

## 0.3.0

- New incident and debugging tools: `get_today_story`, `get_project_health`, `investigate_incident`,
  `search_logs`, `get_log`, `search_requests`, `get_request`, `update_error_issue` and `list_replays`.
  `investigate_incident` gathers health, failing endpoints, error logs, top issues and replays for one
  window in a single call, and skips (with a note) any part the token has no scope for.
- Prompts: `incident-review`, `daily-standup`, `weekly-report` and `funnel-audit`, shown as slash
  commands in clients that support MCP prompts.
- `list_error_issues` now says that each issue's `id` is what `update_error_issue` takes.

## 0.2.2

- `get_analytics_overview` takes an optional `range` (`24h`, `7d` or `30d`, default `7d`), matching the
  dashboard's Overview time range. Its description now says which window the numbers cover; it used to
  claim 30 days for every figure.
- The server now reports its real version to MCP clients (it said 0.2.0).

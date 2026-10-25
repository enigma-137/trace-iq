# Changelog

## 0.2.2

- `get_analytics_overview` takes an optional `range` (`24h`, `7d` or `30d`, default `7d`), matching the
  dashboard's Overview time range. Its description now says which window the numbers cover; it used to
  claim 30 days for every figure.
- The server now reports its real version to MCP clients (it said 0.2.0).

# Deployment

## Local Development

Local dependencies run through Docker Compose:

```bash
docker compose up -d
```

## Environments

- Development: local apps and Docker-managed services.
- Staging: production-like cloud environment for validation.
- Production: managed PostgreSQL, Redis-compatible queue backend, hosted API, dashboard, and marketing apps.

## Future Infrastructure

- Add ClickHouse for analytical event storage.
- Add object storage for replay segments.
- Add queue workers for ingestion fan-out.
- Add observability for API latency, ingestion lag, queue depth, and dropped events.

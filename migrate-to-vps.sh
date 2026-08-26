#!/usr/bin/env bash
set -euo pipefail

# One-time migration: Neon -> VPS Postgres
# Run this ONCE after initial docker compose up (postgres+redis only)

NEON_DATABASE_URL="${1:-}"
if [[ -z "$NEON_DATABASE_URL" ]]; then
  echo "Usage: $0 <NEON_DATABASE_URL>"
  echo "Example: $0 'postgresql://user:pass@host/db?sslmode=require'"
  exit 1
fi

echo "📤 Dumping Neon database..."
pg_dump "$NEON_DATABASE_URL" --no-owner --no-acl --clean --if-exists > /tmp/neon.dump

echo "📥 Restoring to VPS Postgres..."
docker exec -i traceiq-postgres-1 pg_restore -U traceiq -d traceiq --no-owner --no-acl < /tmp/neon.dump

echo "✅ Verifying..."
docker exec traceiq-postgres-1 psql -U traceiq -d traceiq -c "\dt"

echo "🎉 Migration complete. Now update .env DATABASE_URL to point to local postgres and restart api."
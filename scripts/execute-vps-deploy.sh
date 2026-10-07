#!/usr/bin/env bash
set -eo pipefail

echo "========================================================"
echo "   TraceIQ Replay Synthetic & Sidebar VPS Deployment    "
echo "========================================================"

cd /opt/traceiq

echo "--- 1. Safety & Pre-Deployment State ---"
PREV_SHA=$(git rev-parse HEAD)
echo "Previous VPS commit SHA: $PREV_SHA"
git status --short

echo "--- 2. Database Backup Discovery & Execution ---"
PG_CONTAINER=$(docker compose ps -q postgres)
echo "Discovered Postgres container: $PG_CONTAINER"
if [ -z "$PG_CONTAINER" ]; then
  echo "ERROR: Postgres container not found via docker compose!"
  exit 1
fi

BACKUP_FILE="backup_pre_replay_extraction_$(date +%Y%m%d_%H%M%S).sql"
echo "Running pg_dump to $BACKUP_FILE ..."
docker exec "$PG_CONTAINER" pg_dump -U traceiq -d traceiq > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
  echo "Backup successfully created: $BACKUP_FILE (Size: $BACKUP_SIZE)"
else
  echo "ERROR: Backup failed or file is empty!"
  exit 1
fi

echo "--- 3. Git Fetch & Pull Latest Code ---"
git fetch origin
git pull --ff-only origin main
NEW_SHA=$(git rev-parse HEAD)
echo "Deployed commit SHA: $NEW_SHA"

echo "--- 4. Apply Migration 0049 & Measure Execution ---"
MIGRATION_FILE="apps/api/migrations/0049_replay_synthetic_integration.sql"
if [ -f "$MIGRATION_FILE" ]; then
  echo "Applying migration: $MIGRATION_FILE"
  START_TS=$(date +%s%N)
  docker exec -i "$PG_CONTAINER" psql -U traceiq -d traceiq < "$MIGRATION_FILE"
  END_TS=$(date +%s%N)
  MIGRATION_RUNTIME_MS=$(( (END_TS - START_TS) / 1000000 ))
  echo "Migration 0049 applied successfully in ${MIGRATION_RUNTIME_MS}ms."
else
  echo "WARNING: $MIGRATION_FILE not found directly on host, will be applied on container start."
fi

echo "--- 5. Verify Postgres Schema & Constraints ---"
docker exec "$PG_CONTAINER" psql -U traceiq -d traceiq -c "
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'synthetic_monitors' 
  AND column_name IN ('source_type', 'source_replay_id', 'source_session_id', 'source_replay_started_at');
"

docker exec "$PG_CONTAINER" psql -U traceiq -d traceiq -c "
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'synthetic_monitors'::regclass
  AND conname = 'synthetic_monitors_source_type_check';
"

echo "--- 6. Rebuild and Restart Docker Containers ---"
docker compose up -d --build --remove-orphans

echo "--- 7. Await Services to Settle & Check Status ---"
sleep 10
docker compose ps

echo "--- 8. Verify API Startup & Logs ---"
docker compose logs api --tail=80

echo "--- 9. Production API Health Verification ---"
curl -s http://127.0.0.1:4000/health
echo ""

echo "========================================================"
echo "          VPS Deployment & Verification Complete        "
echo "========================================================"

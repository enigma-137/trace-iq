#!/usr/bin/env bash
set -eo pipefail

echo "=== TraceIQ Production Replay -> Synthetic Smoke Test ==="
cd /opt/traceiq

PG_CONTAINER=$(docker compose ps -q postgres)
API_CONTAINER=$(docker compose ps -q api)

echo "Postgres container: $PG_CONTAINER"
echo "API container: $API_CONTAINER"

# 1. Check Replays
echo "--- 1. Querying Recent Replays ---"
docker exec "$PG_CONTAINER" psql -U traceiq -d traceiq -c "
SELECT id, project_id, session_id, duration_ms, event_count 
FROM session_replays 
ORDER BY created_at DESC 
LIMIT 3;
"

# 2. Check Extraction logic via internal API test
echo "--- 2. Testing Extraction Service directly in Node API runtime ---"
docker exec "$API_CONTAINER" node -e "
const { ReplaySyntheticExtractorService } = require('/app/apps/api/dist/apps/api/src/modules/synthetic-monitoring/replay-synthetic-extractor.service.js');
const extractor = new ReplaySyntheticExtractorService();

const sampleEvents = [
  { type: 4, data: { href: 'https://app.traceiq.com/dashboard' } },
  { type: 3, data: { source: 2, type: 2, id: 101, tag: 'button', text: 'Create Project', attributes: { id: 'btn-create-project' } } },
  { type: 3, data: { source: 5, id: 102, text: 'Secret123!', tag: 'input', attributes: { type: 'password', name: 'password' } } }
];

const draft = extractor.extractJourneyFromEvents(sampleEvents, 'https://app.traceiq.com');
console.log('Extracted steps count:', draft.steps.length);
console.log('Steps:', JSON.stringify(draft.steps, null, 2));

if (draft.steps.length === 3 && draft.steps[2].action === 'fill' && draft.steps[2].value === '••••••••') {
  console.log('Extraction smoke test PASSED: password masked, steps structured correctly.');
} else {
  console.error('Extraction smoke test FAILED!');
  process.exit(1);
}
"

# 3. Check Synthetic Monitors schema
echo "--- 3. Checking Synthetic Monitors table ---"
docker exec "$PG_CONTAINER" psql -U traceiq -d traceiq -c "
SELECT id, name, source_type, source_replay_id, source_funnel_id, created_at 
FROM synthetic_monitors 
ORDER BY created_at DESC 
LIMIT 3;
"

# 4. Check API routes / health
echo "--- 4. Checking API endpoints ---"
curl -s http://127.0.0.1:4000/health
echo ""

echo "=== All Smoke Tests Passed ==="

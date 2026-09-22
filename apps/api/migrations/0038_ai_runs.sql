-- AI runs audit and usage tracking foundation.
--
-- Records lightweight metadata for all AI runs across capabilities (funnel analysis,
-- today's story, and future assistant queries). Strictly project-scoped.
-- Distinguishes requested model from actual routed model returned by the gateway.
-- Does NOT store raw customer prompt or completion text to preserve data privacy.

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  routed_model TEXT,
  status TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER NOT NULL,
  provider_request_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_runs_status_check
    CHECK (status IN ('success', 'failed', 'fallback', 'timeout', 'blocked')),
  CONSTRAINT ai_runs_capability_check
    CHECK (capability IN ('funnel_analysis', 'story_analysis', 'assistant', 'alert_investigation'))
);

CREATE INDEX IF NOT EXISTS ai_runs_project_created_idx
  ON ai_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_project_capability_created_idx
  ON ai_runs(project_id, capability, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_org_created_idx
  ON ai_runs(organization_id, created_at DESC);

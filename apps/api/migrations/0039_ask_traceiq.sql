-- Ask TraceIQ v1 Architecture Foundation
--
-- Introduces logical ai_investigations, ai_conversations, ai_messages,
-- and links provider-level ai_runs to parent investigations.
-- Strictly scoped to organization and project. Does not persist sensitive raw prompts.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_project_updated_idx
  ON ai_conversations(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_conversations_org_idx
  ON ai_conversations(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_investigations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'global',
  context_type TEXT,
  context_id TEXT,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  usage_charged BOOLEAN NOT NULL DEFAULT false,
  tool_calls_count INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_followups JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_investigations_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'insufficient_data', 'quota_exceeded'))
);

CREATE INDEX IF NOT EXISTS ai_investigations_project_created_idx
  ON ai_investigations(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_investigations_conversation_idx
  ON ai_investigations(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  investigation_id TEXT REFERENCES ai_investigations(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_followups JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx
  ON ai_messages(conversation_id, created_at ASC);

ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS investigation_id TEXT REFERENCES ai_investigations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_runs_investigation_idx
  ON ai_runs(investigation_id);

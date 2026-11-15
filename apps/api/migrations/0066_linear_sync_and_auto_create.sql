-- Linear integration (phase 3): webhook sync and opt-in auto-create.

-- Who last changed an error issue's status. 'linear' means a Linear webhook resolved or
-- reopened it (shown as "synced from Linear"); NULL means a person in TraceIQ.
ALTER TABLE error_issues ADD COLUMN IF NOT EXISTS status_source TEXT
  CHECK (status_source IS NULL OR status_source IN ('linear'));

-- The newest Linear issue update applied to the error, so a retried or out-of-order
-- webhook delivery never overrides a newer state.
ALTER TABLE error_linear_issues ADD COLUMN IF NOT EXISTS linear_state_type TEXT;
ALTER TABLE error_linear_issues ADD COLUMN IF NOT EXISTS linear_updated_at TIMESTAMPTZ;
-- 'manual' (the button) or 'auto' (the threshold rule).
ALTER TABLE error_linear_issues ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'manual'
  CHECK (created_via IN ('manual', 'auto'));

-- Per-project auto-create rule. Off by default; when on, at least one threshold is set
-- (checked by the API). An error qualifies when occurrences >= min_occurrences OR
-- affected users >= min_users.
ALTER TABLE linear_project_settings ADD COLUMN IF NOT EXISTS auto_create_linear_issues BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE linear_project_settings ADD COLUMN IF NOT EXISTS auto_create_min_occurrences INTEGER
  CHECK (auto_create_min_occurrences IS NULL OR auto_create_min_occurrences > 0);
ALTER TABLE linear_project_settings ADD COLUMN IF NOT EXISTS auto_create_min_users INTEGER
  CHECK (auto_create_min_users IS NULL OR auto_create_min_users > 0);

-- A short-lived claim taken before calling Linear, so only one request or API instance
-- creates the Linear issue for an error. Claims older than a few minutes are treated as
-- abandoned (a crash mid-request) and can be taken over.
CREATE TABLE IF NOT EXISTS error_linear_issue_claims (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, fingerprint)
);

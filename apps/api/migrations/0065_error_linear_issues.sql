-- Linear integration (phase 2): the Linear issue created for an error issue.
--
-- An error issue is (project_id, fingerprint), the same key as error_issues. One
-- Linear issue per error issue: creating again returns this row instead of a
-- duplicate. linear_issue_id is unique so webhook updates (phase 3) can find the
-- error from the Linear issue.

CREATE TABLE IF NOT EXISTS error_linear_issues (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  linear_issue_id TEXT NOT NULL UNIQUE,
  -- Human identifier such as ENG-123, and the issue URL in Linear.
  identifier TEXT NOT NULL,
  url TEXT NOT NULL,
  team_id TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, fingerprint)
);

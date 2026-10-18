-- 0051_error_issues.sql
-- Workflow state for error issues.
--
-- An issue is the group of `$exception` events that share a fingerprint
-- (`properties->>'$fingerprint'`, stamped at ingest from the top in-app stack
-- frames). Events stored before fingerprinting fall back to md5(type || '\n' ||
-- message), the same expression the API groups by.
--
-- Occurrence counts and first/last seen are always read from `events`; this
-- table only holds what people decide about an issue, and a row exists only once
-- someone has acted on it. "Regressed" is not stored: it is a resolved issue
-- whose last occurrence is after `resolved_at`.

CREATE TABLE IF NOT EXISTS error_issues (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  assignee_user_id TEXT,
  resolved_at TIMESTAMPTZ,
  updated_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS error_issues_project_status_idx ON error_issues (project_id, status);

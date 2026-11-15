-- GitHub App integration (phase 5): the setup pull request opened for a project, so the
-- wizard can show it again and a second click returns it instead of opening another.

CREATE TABLE IF NOT EXISTS github_setup_pull_requests (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  url TEXT NOT NULL,
  -- What the generator detected, e.g. 'Next.js (App Router)'.
  framework_label TEXT,
  app_subdirectory TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

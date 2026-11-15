-- GitHub App integration (phase 4). Separate from GitHub sign-in: this is the TraceIQ
-- GitHub App installed on a GitHub account or org, used later to open setup PRs.
-- One installation per TraceIQ organization; an installation belongs to one organization.
-- Access is checked in the API (organization membership and role), and rows go away with
-- their organization or project.

CREATE TABLE IF NOT EXISTS github_installations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_type TEXT,
  -- 'all' or 'selected': which of the account's repositories the app can see.
  repository_selection TEXT NOT NULL DEFAULT 'selected' CHECK (repository_selection IN ('all', 'selected')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  installed_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_project_repos (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  repo_id BIGINT NOT NULL,
  repo_full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  -- For monorepos: the app's folder relative to the repository root ('' for the root).
  app_subdirectory TEXT NOT NULL DEFAULT '',
  linked_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS github_project_repos_installation_idx ON github_project_repos(installation_id, repo_id);

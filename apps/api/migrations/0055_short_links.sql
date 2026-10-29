-- 0055_short_links.sql
-- Short links: /l/<slug> redirects to a destination and records a `$link_click`
-- event in the link's project, so clicks work in funnels, trends and alerts.
--
-- Slugs are unique across all projects because every link shares one domain.
-- click_count and last_clicked_at are a cheap running total for the list view;
-- the events table stays the source of truth for anything time-based.

CREATE TABLE IF NOT EXISTS short_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  title TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  expires_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT short_links_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS short_links_slug_idx ON short_links (slug);
CREATE INDEX IF NOT EXISTS short_links_project_created_idx ON short_links (project_id, created_at DESC);

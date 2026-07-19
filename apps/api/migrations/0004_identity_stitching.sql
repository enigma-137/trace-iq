-- Identity stitching: when an anonymous visitor later identifies, we link their
-- anonymous_id to the user and backfill their pre-login events onto that user, so
-- one person is counted as one actor across trends, funnels, retention, etc.

-- Records each anonymous_id -> user link once, so the (expensive) backfill runs
-- exactly once per link rather than on every subsequent event.
CREATE TABLE IF NOT EXISTS identity_links (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  anonymous_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, anonymous_id)
);

CREATE INDEX IF NOT EXISTS identity_links_user_id_idx ON identity_links(project_id, user_id);

-- Targets exactly the rows the backfill UPDATE touches (anonymous events awaiting a user).
CREATE INDEX IF NOT EXISTS events_project_anonymous_unlinked_idx
  ON events(project_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL AND user_id IS NULL;

-- 0053_source_maps.sql
-- Source maps uploaded per release, used to show original file names, lines
-- and code in error stack traces.
--
-- `file` is the path of the minified file the map belongs to, relative to the
-- build output (e.g. `assets/index-3f2a9c1b.js`). A stack frame matches a map
-- when its URL path ends with that path, and the event's release equals
-- `release`. Uploading the same release and file again replaces the map.
-- Stacks are symbolicated when an issue is read; stored events never change.

CREATE TABLE IF NOT EXISTS source_maps (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  release TEXT NOT NULL,
  file TEXT NOT NULL,
  content TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, release, file)
);

CREATE INDEX IF NOT EXISTS source_maps_project_release_idx ON source_maps (project_id, release);

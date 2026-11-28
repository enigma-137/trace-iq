-- Public status pages for customers' own services (traceiq.run/status/<slug>).
-- A project has at most one page. Its components are synthetic monitors shown under
-- public names; their uptime comes from synthetic_runs. Incidents and maintenance are
-- written by the project's owners and admins. Safe to re-run.

CREATE TABLE IF NOT EXISTS status_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  -- Global: the page lives at /status/<slug>.
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  title TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The monitors a page shows, in order. Monitor names and URLs stay private; only
-- display_name and description are public.
CREATE TABLE IF NOT EXISTS status_page_components (
  id TEXT PRIMARY KEY,
  status_page_id TEXT NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id TEXT NOT NULL REFERENCES synthetic_monitors(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (status_page_id, monitor_id)
);

CREATE INDEX IF NOT EXISTS status_page_components_page_idx ON status_page_components (status_page_id, position);

-- Incidents and scheduled maintenance. `status` moves through
-- investigating → identified → monitoring → resolved for incidents, and
-- scheduled → in_progress → completed for maintenance.
CREATE TABLE IF NOT EXISTS status_incidents (
  id TEXT PRIMARY KEY,
  status_page_id TEXT NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('incident', 'maintenance')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'completed')),
  impact TEXT NOT NULL DEFAULT 'minor' CHECK (impact IN ('none', 'minor', 'major', 'critical')),
  -- status_page_components ids this affects.
  component_ids TEXT[] NOT NULL DEFAULT '{}',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'incident' AND status IN ('investigating', 'identified', 'monitoring', 'resolved'))
      OR (kind = 'maintenance' AND status IN ('scheduled', 'in_progress', 'completed')))
);

CREATE INDEX IF NOT EXISTS status_incidents_page_time_idx ON status_incidents (status_page_id, started_at DESC);

CREATE TABLE IF NOT EXISTS status_incident_updates (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_incident_updates_incident_idx ON status_incident_updates (incident_id, created_at DESC);

-- 0043_insights_and_dashboards_v2.sql
-- Substantial redesign: Reusable Insights, Multi-widget Dashboards, Layouts, and Template Instantiation

-- 1. Create insights table
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'trend',
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  visualization JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insights_project_created_idx
  ON insights(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS insights_project_pinned_idx
  ON insights(project_id, is_pinned) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS insights_creator_idx
  ON insights(created_by_user_id);

CREATE INDEX IF NOT EXISTS insights_type_idx
  ON insights(project_id, type);

-- 2. Enhance dashboards table
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS dashboards_project_pinned_idx
  ON dashboards(project_id, is_pinned) WHERE is_pinned = true;

-- 3. Create dashboard_widgets table
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  insight_id TEXT REFERENCES insights(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  widget_type TEXT NOT NULL DEFAULT 'insight',
  query_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  visualization_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_widgets_dashboard_pos_idx
  ON dashboard_widgets(dashboard_id, position ASC);

CREATE INDEX IF NOT EXISTS dashboard_widgets_insight_idx
  ON dashboard_widgets(insight_id);

-- 4. Backfill: If legacy single-query dashboards exist with a definition, create matching insights and widgets
INSERT INTO insights (id, project_id, name, description, type, query, visualization, filters, date_config, tags, is_pinned, created_by_user_id, created_at, updated_at)
SELECT
  'ins_' || substr(d.id, 6),
  d.project_id,
  d.name,
  'Saved view',
  COALESCE(d.definition->>'source', 'trend'),
  d.definition,
  jsonb_build_object('chartType', 'line'),
  COALESCE(d.definition->'filters', '[]'::jsonb),
  jsonb_build_object('days', COALESCE(d.definition->>'days', '30')),
  '{}'::text[],
  false,
  d.owner_id,
  d.created_at,
  d.updated_at
FROM dashboards d
WHERE d.definition IS NOT NULL
  AND d.definition != '{}'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM insights i WHERE i.id = ('ins_' || substr(d.id, 6))
  );

INSERT INTO dashboard_widgets (id, dashboard_id, insight_id, title, description, widget_type, layout, position, created_at, updated_at)
SELECT
  'wid_' || substr(d.id, 6),
  d.id,
  'ins_' || substr(d.id, 6),
  d.name,
  'Auto-migrated widget',
  'insight',
  jsonb_build_object('w', 12, 'h', 4, 'x', 0, 'y', 0),
  0,
  d.created_at,
  d.updated_at
FROM dashboards d
WHERE d.definition IS NOT NULL
  AND d.definition != '{}'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_widgets w WHERE w.dashboard_id = d.id
  );

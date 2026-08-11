-- Achievements: a seeded catalogue of earnable milestones. Progress is computed
-- live from the events/projects tables (see AchievementsService's metric registry),
-- so nothing here is denormalized. Unlocks are recorded idempotently per user so
-- re-evaluation never overwrites the original unlocked_at.

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  badge TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  kind TEXT NOT NULL DEFAULT 'one_time',
  -- Metric key resolved against the backend metric registry, e.g. "events.all_time".
  metric TEXT NOT NULL,
  threshold DOUBLE PRECISION NOT NULL DEFAULT 1,
  -- Hidden achievements are awarded but never listed until earned (future secret badges).
  hidden BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS achievements_sort_idx ON achievements(sort_order);

CREATE TABLE IF NOT EXISTS achievement_unlocks (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS achievement_unlocks_user_unlocked_idx
  ON achievement_unlocks(user_id, unlocked_at DESC);

-- Fixture achievements. Thresholds are intentionally small so each state
-- (earned / partial / locked) can be hit during development; the real
-- catalogue ships later without changing this table's shape.
INSERT INTO achievements (id, slug, title, description, badge, category, kind, metric, threshold, sort_order)
VALUES
  ('achv_first_signal', 'first-signal', 'First Signal', 'Track your first 100 events in a single project.', '/brand/achievements/first-signal.svg', 'Data', 'one_time', 'events.all_time', 100, 10),
  ('achv_event_machine', 'event-machine', 'Event Machine', 'Reach 10,000 events in a single project.', '/brand/achievements/event-machine.svg', 'Data', 'one_time', 'events.all_time', 10000, 20),
  ('achv_multi_project', 'multi-project', 'Multi-Project Founder', 'Create 3 projects in your workspace.', '/brand/achievements/multi-project.svg', 'Workspace', 'one_time', 'projects.count', 3, 30)
ON CONFLICT (id) DO NOTHING;

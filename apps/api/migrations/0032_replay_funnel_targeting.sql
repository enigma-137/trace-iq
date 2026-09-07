-- Additive Session Replay targeting. Funnel definitions remain the source of
-- truth; these tables only select funnels and record which ones matched.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE UNIQUE INDEX IF NOT EXISTS funnels_id_project_replay_target_fk_idx
  ON funnels(id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS session_replays_id_project_flow_fk_idx
  ON session_replays(id, project_id);

CREATE TABLE IF NOT EXISTS replay_setting_funnels (
  project_id TEXT NOT NULL,
  funnel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, funnel_id),
  CONSTRAINT replay_setting_funnels_settings_fk
    FOREIGN KEY (project_id) REFERENCES replay_settings(project_id) ON DELETE CASCADE,
  CONSTRAINT replay_setting_funnels_tenant_fk
    FOREIGN KEY (funnel_id, project_id) REFERENCES funnels(id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS replay_setting_funnels_funnel_idx
  ON replay_setting_funnels(funnel_id);

CREATE TABLE IF NOT EXISTS session_replay_funnels (
  replay_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  funnel_id TEXT NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (replay_id, funnel_id),
  CONSTRAINT session_replay_funnels_replay_tenant_fk
    FOREIGN KEY (replay_id, project_id) REFERENCES session_replays(id, project_id) ON DELETE CASCADE,
  CONSTRAINT session_replay_funnels_funnel_tenant_fk
    FOREIGN KEY (funnel_id, project_id) REFERENCES funnels(id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_replay_funnels_project_idx
  ON session_replay_funnels(project_id, replay_id);
CREATE INDEX IF NOT EXISTS session_replay_funnels_funnel_idx
  ON session_replay_funnels(funnel_id);

COMMENT ON TABLE replay_setting_funnels IS
  'Project-confined funnels selected as Session Replay eligibility targets.';
COMMENT ON TABLE session_replay_funnels IS
  'Current funnel definitions that caused an existing replay session to become eligible.';

-- Funnel deletion removes only targeting/match associations. Replay metadata,
-- chunks, and payload objects retain their normal retention lifecycle.
-- Data-preserving rollback: deploy code that ignores these tables first, then
-- leave them in place. Destructive rollback requires explicit approval.

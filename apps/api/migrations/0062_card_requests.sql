-- Requests for Overview cards TraceIQ doesn't have yet, sent from the "+" menu.
--
-- Each row keeps who asked and from which project, so the team can see which
-- cards are wanted most and tell people when one ships. Rows go with their
-- organization when it is deleted.

CREATE TABLE IF NOT EXISTS card_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  request TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'shipped', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_requests_user_created_idx ON card_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_requests_status_created_idx ON card_requests(status, created_at DESC);

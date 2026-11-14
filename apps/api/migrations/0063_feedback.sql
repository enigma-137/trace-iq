-- Everything people send the TraceIQ team from inside the product: card requests
-- from the Overview's + menu and feedback from the dashboard header. The platform
-- admin console reads them as an inbox, with an unread count on its bell.
--
-- Replaces card_requests (0062): its rows move here as kind 'card_request'.

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('card_request', 'idea', 'problem', 'other')),
  user_id TEXT NOT NULL,
  user_email TEXT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  -- The dashboard path it was sent from, for context ("/dashboard/funnels").
  page TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'done', 'declined')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_unread_idx ON feedback(created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS feedback_user_created_idx ON feedback(user_id, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.card_requests') IS NOT NULL THEN
    INSERT INTO feedback (id, kind, user_id, user_email, organization_id, project_id, message, status, created_at)
    SELECT
      id, 'card_request', user_id, user_email, organization_id, project_id, request,
      CASE status WHEN 'shipped' THEN 'done' ELSE status END,
      created_at
    FROM card_requests
    ON CONFLICT (id) DO NOTHING;

    DROP TABLE card_requests;
  END IF;
END $$;

CREATE TABLE account_lifecycle_requests (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('account', 'organization')),
  target_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CONSTRAINT account_lifecycle_schedule_check
    CHECK (scheduled_for > requested_at)
);

CREATE UNIQUE INDEX account_lifecycle_active_request_idx
  ON account_lifecycle_requests(target_type, target_id)
  WHERE status = 'pending';

CREATE INDEX account_lifecycle_due_idx
  ON account_lifecycle_requests(scheduled_for)
  WHERE status = 'pending';

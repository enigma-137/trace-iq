-- Setup Verifications table for live CLI and Dashboard onboarding verification
CREATE TABLE IF NOT EXISTS setup_verifications (
  id VARCHAR(64) PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  verified_event_name VARCHAR(255),
  verified_event_id VARCHAR(64),
  verified_metadata JSONB,
  CONSTRAINT chk_setup_verification_status CHECK (status IN ('pending', 'verified', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_setup_verifications_project_id ON setup_verifications (project_id);
CREATE INDEX IF NOT EXISTS idx_setup_verifications_expires_at ON setup_verifications (expires_at);
CREATE INDEX IF NOT EXISTS idx_setup_verifications_status ON setup_verifications (status);

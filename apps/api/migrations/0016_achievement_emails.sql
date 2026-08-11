-- Best-effort unlock emails. email_sent_at guards resends (an unlock is emailed
-- exactly once); the partial index keeps the "what still needs an email" scan
-- cheap on the read/ingest paths.

ALTER TABLE achievement_unlocks ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS achievement_unlocks_unsent_idx
  ON achievement_unlocks(email_sent_at)
  WHERE email_sent_at IS NULL;

-- Cache each workspace member's dashboard email (captured from the reader's
-- session on dashboard reads) so unlock emails can be addressed automatically,
-- without a Supabase service-role lookup. Populated lazily, member by member.
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS email TEXT;

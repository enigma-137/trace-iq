-- Remote config: attach an optional JSON payload to a flag. When the flag is on
-- for a user, the SDK receives this value (e.g. a config object, copy, or limits)
-- so a single flag can carry data, not just a boolean.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS payload JSONB;

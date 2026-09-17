-- Migration 0035: High-performance trigram and keyset indexes for user search
-- Enables fast index-backed substring searches (ILIKE '%query%') across 100k+ users.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Trigram GIN index on external_id (distinct ID)
CREATE INDEX IF NOT EXISTS users_external_id_trgm_idx
  ON users USING gin (external_id gin_trgm_ops)
  WHERE external_id IS NOT NULL;

-- 2. Trigram GIN index on anonymous_id
CREATE INDEX IF NOT EXISTS users_anonymous_id_trgm_idx
  ON users USING gin (anonymous_id gin_trgm_ops)
  WHERE anonymous_id IS NOT NULL;

-- 3. Trigram GIN index on high-value identity traits (name, full_name, displayName, email, username)
CREATE INDEX IF NOT EXISTS users_traits_identity_trgm_idx
  ON users USING gin ((
    COALESCE(traits->>'name', '') || ' ' ||
    COALESCE(traits->>'full_name', '') || ' ' ||
    COALESCE(traits->>'displayName', '') || ' ' ||
    COALESCE(traits->>'email', '') || ' ' ||
    COALESCE(traits->>'username', '')
  ) gin_trgm_ops);

-- 4. Composite index for fast project-scoped keyset/cursor pagination
CREATE INDEX IF NOT EXISTS users_project_last_seen_id_idx
  ON users (project_id, last_seen_at DESC, id DESC);

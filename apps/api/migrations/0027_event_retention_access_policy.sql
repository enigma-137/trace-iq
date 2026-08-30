-- Enforce the effective Cloud retention window on every events SELECT. Keeping
-- this at the database boundary covers dashboard, public/API, SDK-adjacent and
-- future query paths even while the physical retention sweep is still pending.
CREATE OR REPLACE FUNCTION traceiq_event_is_within_retention(
  target_project_id TEXT,
  target_occurred_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(current_setting('traceiq.deployment_mode', true), 'self_hosted') <> 'cloud'
    OR COALESCE(current_setting('traceiq.retention_sweep', true), 'off') = 'on'
    OR target_occurred_at >= now() - (
      COALESCE(
        (
          SELECT CASE
            WHEN jsonb_typeof(eo.value) = 'number' THEN (eo.value #>> '{}')::integer
            ELSE NULL
          END
          FROM projects override_project
          JOIN entitlement_overrides eo
            ON eo.organization_id = override_project.organization_id
           AND eo.entitlement_key = 'retentionDays'
           AND (eo.expires_at IS NULL OR eo.expires_at > now())
          WHERE override_project.id = target_project_id
          ORDER BY eo.created_at DESC
          LIMIT 1
        ),
        (
          SELECT CASE
            WHEN latest.plan_key = 'pro' AND (
              latest.status IN ('active', 'trialing')
              OR (latest.status = 'past_due' AND latest.grace_period_ends_at > now())
            ) THEN 365
            ELSE 30
          END
          FROM projects entitlement_project
          LEFT JOIN LATERAL (
            SELECT plan_key, status, grace_period_ends_at
            FROM subscriptions
            WHERE organization_id = entitlement_project.organization_id
            ORDER BY updated_at DESC
            LIMIT 1
          ) latest ON true
          WHERE entitlement_project.id = target_project_id
        ),
        30
      ) * interval '1 day'
    );
$$;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_retention_select ON events;
CREATE POLICY events_retention_select ON events
  FOR SELECT
  USING (traceiq_event_is_within_retention(project_id, occurred_at));

DROP POLICY IF EXISTS events_insert ON events;
CREATE POLICY events_insert ON events
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS events_update ON events;
CREATE POLICY events_update ON events
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS events_delete ON events;
CREATE POLICY events_delete ON events
  FOR DELETE
  USING (true);

COMMENT ON FUNCTION traceiq_event_is_within_retention(TEXT, TIMESTAMPTZ) IS
  'Database-authoritative read-time retention guard. Cloud Free=30d, Pro=365d; self-hosted bypasses.';

-- 0056_revenue_settings.sql
-- Revenue tracking is opt-in per project. A project names the events that mean
-- "payment succeeded" and "payment failed", the property that holds the amount,
-- and the currency to show. Without a row (or with enabled = false), the
-- project has no revenue metrics.
--
-- Projects that already send revenue keep it: they are set up from the events
-- that carried a numeric `amount` in the last 90 days, using the same rule the
-- overview used before (names that sound like intent or failure are skipped).

CREATE TABLE IF NOT EXISTS revenue_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  success_events TEXT[] NOT NULL DEFAULT '{}',
  failed_events TEXT[] NOT NULL DEFAULT '{}',
  amount_property TEXT NOT NULL DEFAULT 'amount',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT revenue_settings_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

WITH paid AS (
  SELECT project_id, event_name, upper(properties->>'currency') AS currency
  FROM events
  WHERE occurred_at >= now() - interval '90 days'
    AND properties->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND event_name !~* '^\$|(^|_)(start|started|initiated|redirected|viewed|opened|clicked|selected|shown|added|attempted|failed|abandoned|cancelled|canceled|declined|pending|returned)($|_)'
),
success AS (
  SELECT project_id, array_agg(DISTINCT event_name ORDER BY event_name) AS events
  FROM paid GROUP BY project_id
),
currency AS (
  SELECT DISTINCT ON (project_id) project_id, currency
  FROM paid
  WHERE currency ~ '^[A-Z]{3}$'
  GROUP BY project_id, currency
  ORDER BY project_id, count(*) DESC
),
failed AS (
  SELECT project_id, array_agg(DISTINCT event_name ORDER BY event_name) AS events
  FROM events
  WHERE occurred_at >= now() - interval '90 days'
    AND project_id IN (SELECT project_id FROM success)
    AND event_name !~ '^\$'
    AND event_name ~* '(^|_)(payment|charge|purchase|subscription|transfer|checkout)(_[a-z]+)*_(failed|declined)$'
  GROUP BY project_id
)
INSERT INTO revenue_settings (project_id, enabled, success_events, failed_events, currency)
SELECT s.project_id, true, s.events, COALESCE(f.events, '{}'), COALESCE(c.currency, 'USD')
FROM success s
LEFT JOIN failed f ON f.project_id = s.project_id
LEFT JOIN currency c ON c.project_id = s.project_id
ON CONFLICT (project_id) DO NOTHING;

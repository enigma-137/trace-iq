-- Repair achievement unlock dates.
--
-- achievement_unlocks.unlocked_at previously defaulted to now() — the moment the
-- pipeline first evaluated a milestone — so badges earned long ago were shown as
-- unlocked "today" and re-emailed as new. This recomputes each unlock from the
-- underlying data (the instant the milestone was actually reached) and marks
-- backfilled unlocks as already-notified so they are never re-emailed.
--
-- Safe to re-run: every statement converges to the same values.

-- events.all_time · occurred_at of the threshold-th event across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT e.occurred_at
           FROM events e
           JOIN projects p ON p.id = e.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY e.occurred_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'events.all_time'
    AND (
      SELECT COUNT(*)
      FROM events e
      JOIN projects p ON p.id = e.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- users.all_time · created_at of the threshold-th user across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT usr.created_at
           FROM users usr
           JOIN projects p ON p.id = usr.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY usr.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'users.all_time'
    AND (
      SELECT COUNT(*)
      FROM users usr
      JOIN projects p ON p.id = usr.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- projects.count · created_at of the threshold-th project in the workspace.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT p.created_at
           FROM projects p
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY p.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'projects.count'
    AND (
      SELECT COUNT(*)
      FROM projects p
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- org.tenure_months · earliest instant the workspace crossed the tenure threshold.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT MIN(o.created_at + floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int * interval '1 month')
           FROM organization_members m
           JOIN organizations o ON o.id = m.organization_id
           WHERE m.user_id = u2.user_id
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'org.tenure_months'
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- flags.count · created_at of the threshold-th feature flag across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM feature_flags t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'flags.count'
    AND (
      SELECT COUNT(*)
      FROM feature_flags t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- alerts.count · created_at of the threshold-th alert across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM alerts t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'alerts.count'
    AND (
      SELECT COUNT(*)
      FROM alerts t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- webhooks.count · created_at of the threshold-th webhook across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM webhooks t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'webhooks.count'
    AND (
      SELECT COUNT(*)
      FROM webhooks t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- funnels.count · created_at of the threshold-th funnel across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM funnels t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'funnels.count'
    AND (
      SELECT COUNT(*)
      FROM funnels t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- dashboards.count · created_at of the threshold-th dashboard across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM dashboards t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'dashboards.count'
    AND (
      SELECT COUNT(*)
      FROM dashboards t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

-- cohorts.count · created_at of the threshold-th cohort across the org's projects.
UPDATE achievement_unlocks u
SET unlocked_at = COALESCE(x.reached_at, u.unlocked_at),
    email_sent_at = CASE
      WHEN x.reached_at IS NOT NULL AND x.reached_at < now() - interval '24 hours' THEN now()
      ELSE u.email_sent_at
    END
FROM (
  SELECT u2.user_id, u2.achievement_id,
         (
           SELECT t.created_at
           FROM cohorts t
           JOIN projects p ON p.id = t.project_id
           JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
           ORDER BY t.created_at ASC
           LIMIT 1
           OFFSET (floor((SELECT threshold FROM achievements WHERE id = u2.achievement_id))::int - 1)
         ) AS reached_at
  FROM achievement_unlocks u2
  JOIN achievements a ON a.id = u2.achievement_id
  WHERE a.metric = 'cohorts.count'
    AND (
      SELECT COUNT(*)
      FROM cohorts t
      JOIN projects p ON p.id = t.project_id
      JOIN organization_members m ON m.user_id = u2.user_id AND m.organization_id = p.organization_id
    ) >= floor(a.threshold)::int
) x
WHERE u.user_id = x.user_id AND u.achievement_id = x.achievement_id;

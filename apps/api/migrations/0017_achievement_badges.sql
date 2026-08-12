-- Point every achievement at its custom mascot artwork (512x512 WebP static
-- assets under apps/dashboard/public/achievements/). The badge column was already
-- the definition's image reference (previously generic SVG icons); this swaps the
-- paths to the final artwork. All 30 achievements have a matching asset, so no
-- fallback badges are required.

UPDATE achievements
SET badge = v.badge
FROM (VALUES
  ('first-project', '/achievements/first-project.webp'),
  ('multi-project', '/achievements/multi-project-founder.webp'),
  ('ten-projects', '/achievements/portfolio.webp'),
  ('fifty-projects', '/achievements/studio.webp'),
  ('hundred-projects', '/achievements/mega-builder.webp'),
  ('first-signal', '/achievements/first-signal.webp'),
  ('event-machine', '/achievements/event-machine.webp'),
  ('one-hundred-k-events', '/achievements/data-firehose.webp'),
  ('one-million-events', '/achievements/event-atlas.webp'),
  ('ten-million-events', '/achievements/terabyte-club.webp'),
  ('first-user', '/achievements/first-contact.webp'),
  ('hundred-users', '/achievements/getting-noticed.webp'),
  ('thousand-users', '/achievements/on-the-map.webp'),
  ('ten-thousand-users', '/achievements/small-city.webp'),
  ('one-month', '/achievements/one-month.webp'),
  ('six-months', '/achievements/half-a-year.webp'),
  ('one-year', '/achievements/one-year.webp'),
  ('two-years', '/achievements/veteran.webp'),
  ('first-flag', '/achievements/flag-bearer.webp'),
  ('ten-flags', '/achievements/feature-fleet.webp'),
  ('first-alert', '/achievements/night-watch.webp'),
  ('ten-alerts', '/achievements/sentry-post.webp'),
  ('first-webhook', '/achievements/webhook-weaver.webp'),
  ('ten-webhooks', '/achievements/webhook-mesh.webp'),
  ('first-funnel', '/achievements/funnel-visionary.webp'),
  ('ten-funnels', '/achievements/funnel-master.webp'),
  ('first-dashboard', '/achievements/dashboard-creator.webp'),
  ('dashboard-architect', '/achievements/dashboard-achitect.webp'),
  ('first-cohort', '/achievements/cohort-curator.webp'),
  ('ten-cohorts', '/achievements/cohort-collector.webp')
) AS v(slug, badge)
WHERE achievements.slug = v.slug;
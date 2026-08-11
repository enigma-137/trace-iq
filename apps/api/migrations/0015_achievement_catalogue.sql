-- Expand the achievement catalogue from the three launch fixtures to the full
-- milestone set. Definitions are data (the metric registry + thresholds), so this
-- is a clean, resumable step: the DELETE cascades away fixture unlock rows and the
-- page lazily re-evaluates everything on the next read.

DELETE FROM achievements;

INSERT INTO achievements (id, slug, title, description, badge, category, kind, metric, threshold, sort_order) VALUES
  -- Workspace · projects
  ('achv_first_project', 'first-project', 'First Project', 'Create your first project and start tracking.', '/brand/achievements/first-project.svg', 'Workspace', 'one_time', 'projects.count', 1, 10),
  ('achv_multi_project', 'multi-project', 'Multi-Project Founder', 'Create 3 projects in your workspace.', '/brand/achievements/multi-project.svg', 'Workspace', 'one_time', 'projects.count', 3, 20),
  ('achv_ten_projects', 'ten-projects', 'Portfolio', 'Create ten projects in your workspace.', '/brand/achievements/ten-projects.svg', 'Workspace', 'one_time', 'projects.count', 10, 30),
  ('achv_fifty_projects', 'fifty-projects', 'Studio', 'Create fifty projects in your workspace.', '/brand/achievements/fifty-projects.svg', 'Workspace', 'one_time', 'projects.count', 50, 40),
  ('achv_hundred_projects', 'hundred-projects', 'Mega Builder', 'Create one hundred projects in your workspace.', '/brand/achievements/hundred-projects.svg', 'Workspace', 'one_time', 'projects.count', 100, 50),
  -- Data · events tracked
  ('achv_first_signal', 'first-signal', 'First Signal', 'Track your first 100 events in a single project.', '/brand/achievements/first-signal.svg', 'Data', 'one_time', 'events.all_time', 100, 110),
  ('achv_event_machine', 'event-machine', 'Event Machine', 'Reach 10,000 events in a single project.', '/brand/achievements/event-machine.svg', 'Data', 'one_time', 'events.all_time', 10000, 120),
  ('achv_hundred_k_events', 'one-hundred-k-events', 'Data Firehose', 'Reach 100,000 events in a single project.', '/brand/achievements/one-hundred-k-events.svg', 'Data', 'one_time', 'events.all_time', 100000, 130),
  ('achv_million_events', 'one-million-events', 'Event Atlas', 'Reach 1,000,000 events in a single project.', '/brand/achievements/one-million-events.svg', 'Data', 'one_time', 'events.all_time', 1000000, 140),
  ('achv_ten_million_events', 'ten-million-events', 'Terabyte Club', 'Reach 10,000,000 events in a single project.', '/brand/achievements/ten-million-events.svg', 'Data', 'one_time', 'events.all_time', 10000000, 150),
  -- People · identified users
  ('achv_first_user', 'first-user', 'First Contact', 'Identify your first user in a project.', '/brand/achievements/first-user.svg', 'People', 'one_time', 'users.all_time', 1, 210),
  ('achv_hundred_users', 'hundred-users', 'Getting Noticed', 'Identify 100 users in a project.', '/brand/achievements/hundred-users.svg', 'People', 'one_time', 'users.all_time', 100, 220),
  ('achv_thousand_users', 'thousand-users', 'On the Map', 'Identify 1,000 users in a project.', '/brand/achievements/thousand-users.svg', 'People', 'one_time', 'users.all_time', 1000, 230),
  ('achv_ten_thousand_users', 'ten-thousand-users', 'Small City', 'Identify 10,000 users in a project.', '/brand/achievements/ten-thousand-users.svg', 'People', 'one_time', 'users.all_time', 10000, 240),
  -- Loyalty · account tenure
  ('achv_one_month', 'one-month', 'One Month', 'Keep building with TraceIQ for one month.', '/brand/achievements/one-month.svg', 'Loyalty', 'one_time', 'org.tenure_months', 1, 310),
  ('achv_six_months', 'six-months', 'Half a Year', 'Keep building with TraceIQ for six months.', '/brand/achievements/six-months.svg', 'Loyalty', 'one_time', 'org.tenure_months', 6, 320),
  ('achv_one_year', 'one-year', 'One Year', 'Keep building with TraceIQ for one year.', '/brand/achievements/one-year.svg', 'Loyalty', 'one_time', 'org.tenure_months', 12, 330),
  ('achv_two_years', 'two-years', 'Veteran', 'Keep building with TraceIQ for two years.', '/brand/achievements/two-years.svg', 'Loyalty', 'one_time', 'org.tenure_months', 24, 340),
  -- Craft · feature usage
  ('achv_first_flag', 'first-flag', 'Flagbearer', 'Create your first feature flag.', '/brand/achievements/first-flag.svg', 'Craft', 'one_time', 'flags.count', 1, 410),
  ('achv_ten_flags', 'ten-flags', 'Feature Fleet', 'Create ten feature flags.', '/brand/achievements/ten-flags.svg', 'Craft', 'one_time', 'flags.count', 10, 420),
  ('achv_first_alert', 'first-alert', 'Night Watch', 'Create your first alert.', '/brand/achievements/first-alert.svg', 'Craft', 'one_time', 'alerts.count', 1, 510),
  ('achv_ten_alerts', 'ten-alerts', 'Sentry Post', 'Create ten alerts.', '/brand/achievements/ten-alerts.svg', 'Craft', 'one_time', 'alerts.count', 10, 520),
  ('achv_first_webhook', 'first-webhook', 'Webhook Weaver', 'Create your first webhook.', '/brand/achievements/first-webhook.svg', 'Craft', 'one_time', 'webhooks.count', 1, 610),
  ('achv_ten_webhooks', 'ten-webhooks', 'Webhook Mesh', 'Create ten webhooks.', '/brand/achievements/ten-webhooks.svg', 'Craft', 'one_time', 'webhooks.count', 10, 620),
  ('achv_first_funnel', 'first-funnel', 'Funnel Visionary', 'Create your first funnel.', '/brand/achievements/first-funnel.svg', 'Craft', 'one_time', 'funnels.count', 1, 710),
  ('achv_ten_funnels', 'ten-funnels', 'Funnel Master', 'Create ten funnels.', '/brand/achievements/ten-funnels.svg', 'Craft', 'one_time', 'funnels.count', 10, 720),
  ('achv_first_dashboard', 'first-dashboard', 'Dashboard Creator', 'Create your first saved dashboard.', '/brand/achievements/first-dashboard.svg', 'Craft', 'one_time', 'dashboards.count', 1, 810),
  ('achv_dashboard_architect', 'dashboard-architect', 'Dashboard Architect', 'Create five saved dashboards.', '/brand/achievements/dashboard-architect.svg', 'Craft', 'one_time', 'dashboards.count', 5, 820),
  ('achv_first_cohort', 'first-cohort', 'Cohort Curator', 'Create your first saved cohort.', '/brand/achievements/first-cohort.svg', 'Craft', 'one_time', 'cohorts.count', 1, 910),
  ('achv_ten_cohorts', 'ten-cohorts', 'Cohort Collector', 'Create ten saved cohorts.', '/brand/achievements/ten-cohorts.svg', 'Craft', 'one_time', 'cohorts.count', 10, 920)
ON CONFLICT (id) DO NOTHING;

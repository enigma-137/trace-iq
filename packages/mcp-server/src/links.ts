import { DASHBOARD_URL } from './client.js';
import { JsonObject } from './types.js';

/**
 * The TraceIQ dashboard page that shows what a tool returned, so an assistant can offer
 * "open in TraceIQ". Null when there is no better page than the dashboard home.
 */

type LinkBuilder = (args: JsonObject, result: unknown) => string | null;

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const enc = (value: string) => encodeURIComponent(value);

function resultId(result: unknown): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  for (const key of ['id', 'dashboardId', 'experimentId']) if (str(record[key])) return str(record[key]);
  for (const key of ['dashboard', 'experiment', 'widget']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && str((nested as Record<string, unknown>).id)) return str((nested as Record<string, unknown>).id);
  }
  return null;
}

const section = (path: string): LinkBuilder => () => path;
const detail = (base: string, key: string): LinkBuilder => (args) => (str(args[key]) ? `${base}/${enc(str(args[key])!)}` : base);

const LINKS: Record<string, LinkBuilder> = {
  get_analytics_overview: section('/dashboard'),
  get_today_story: section('/dashboard'),
  get_project_health: section('/dashboard'),
  get_web_analytics: section('/dashboard/web'),
  get_api_performance: section('/dashboard/api-performance'),
  summarize_api_health: section('/dashboard/api-performance'),
  list_event_names: section('/dashboard/events'),
  get_trends: section('/dashboard/insights'),
  run_insight_query: section('/dashboard/insights'),
  get_retention: section('/dashboard/retention'),
  show_retention_changes: section('/dashboard/retention'),
  list_funnels: section('/dashboard/funnels'),
  get_funnel: detail('/dashboard/funnels', 'funnelId'),
  get_funnel_results: detail('/dashboard/funnels', 'funnelId'),
  get_funnel_step_users: detail('/dashboard/funnels', 'funnelId'),
  summarize_funnel_dropoff: detail('/dashboard/funnels', 'funnelId'),
  explain_conversion_drop: detail('/dashboard/funnels', 'funnelId'),
  find_users_who_failed_checkout: detail('/dashboard/funnels', 'funnelId'),
  list_error_issues: section('/dashboard/errors'),
  get_error_issue: (args) =>
    str(args.type) && str(args.message) ? `/dashboard/errors?type=${enc(str(args.type)!)}&message=${enc(str(args.message)!)}` : '/dashboard/errors',
  update_error_issue: (args) => (str(args.issueId) ? `/dashboard/errors?issue=${enc(str(args.issueId)!)}` : '/dashboard/errors'),
  list_users: section('/dashboard/users'),
  get_user: detail('/dashboard/users', 'userId'),
  get_user_timeline: detail('/dashboard/users', 'userId'),
  list_feature_flags: section('/dashboard/flags'),
  toggle_feature_flag: detail('/dashboard/flags', 'flagId'),
  list_alerts: section('/dashboard/alerts'),
  create_alert: section('/dashboard/alerts'),
  set_alert_enabled: section('/dashboard/alerts'),
  list_links: section('/dashboard/links'),
  get_link_stats: section('/dashboard/links'),
  create_link: section('/dashboard/links'),
  search_logs: section('/dashboard/logs'),
  get_log: (args) => (str(args.logId) ? `/dashboard/logs?logId=${enc(str(args.logId)!)}` : '/dashboard/logs'),
  search_requests: section('/dashboard/requests'),
  investigate_incident: section('/dashboard/requests'),
  get_request: (args) => (str(args.requestId) ? `/dashboard/requests?range=30d&request=${enc(str(args.requestId)!)}` : '/dashboard/requests'),
  list_replays: section('/dashboard/replays'),
  list_dashboards: section('/dashboard/dashboards'),
  get_dashboard: detail('/dashboard/dashboards', 'dashboardId'),
  add_dashboard_widget: detail('/dashboard/dashboards', 'dashboardId'),
  create_dashboard: (_args, result) => (resultId(result) ? `/dashboard/dashboards/${enc(resultId(result)!)}` : '/dashboard/dashboards'),
  list_experiments: section('/dashboard/experiments'),
  get_experiment_results: detail('/dashboard/experiments', 'experimentId'),
  set_experiment_status: detail('/dashboard/experiments', 'experimentId'),
  create_experiment: (_args, result) => (resultId(result) ? `/dashboard/experiments/${enc(resultId(result)!)}` : '/dashboard/experiments'),
  list_surveys: section('/dashboard/surveys'),
  get_survey_results: detail('/dashboard/surveys', 'surveyId'),
  set_survey_status: detail('/dashboard/surveys', 'surveyId'),
  list_cohorts: section('/dashboard/cohorts'),
  create_cohort: section('/dashboard/cohorts'),
  list_synthetic_monitors: section('/dashboard/synthetic-monitors'),
  get_synthetic_monitor_runs: detail('/dashboard/synthetic-monitors', 'monitorId'),
  run_synthetic_monitor: detail('/dashboard/synthetic-monitors', 'monitorId'),
  set_synthetic_monitor_paused: detail('/dashboard/synthetic-monitors', 'monitorId'),
  list_webhooks: section('/dashboard/webhooks'),
  list_webhook_deliveries: section('/dashboard/webhooks'),
  retry_webhook_delivery: section('/dashboard/webhooks'),
  test_webhook: section('/dashboard/webhooks')
};

/** Absolute dashboard URL for a tool's result, keeping the project selected. */
export function dashboardLink(toolName: string, args: JsonObject, result: unknown, dashboardUrl = DASHBOARD_URL): string | null {
  const build = LINKS[toolName];
  const path = build?.(args, result);
  if (!path) return null;
  const url = new URL(path, `${dashboardUrl}/`);
  const projectId = str(args.projectId);
  if (projectId && !url.searchParams.has('projectId')) url.searchParams.set('projectId', projectId);
  return url.toString();
}

export const linkedTools = Object.keys(LINKS);

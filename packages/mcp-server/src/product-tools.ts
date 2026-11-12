import { request } from './client.js';
import { shapeResponse } from './shape.js';
import { JsonObject, JsonValue, SchemaProperty, Tool } from './types.js';

/**
 * Tools for the rest of the product: open-ended insight queries, dashboards, experiments,
 * surveys, cohorts, synthetic monitors and webhooks. Each wraps a dashboard endpoint that
 * already checks the PAT scope listed on the tool.
 */

const projectProperty: SchemaProperty = { type: 'string', description: 'Optional project id. Defaults to the first accessible project.' };

function withProject(projectId: unknown): Record<string, JsonValue> {
  return typeof projectId === 'string' && projectId ? { projectId } : {};
}

function pick(target: Record<string, JsonValue>, args: JsonObject, keys: string[]): Record<string, JsonValue> {
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== '') target[key] = value;
  }
  return target;
}

const id = (value: unknown) => encodeURIComponent(String(value));

/** A read tool with only a project id (and optional extras) in its query. */
function readTool(options: {
  name: string;
  title: string;
  description: string;
  scope: string;
  path: (args: JsonObject) => string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  queryKeys?: string[];
  maxItems?: number;
}): Tool {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    requiredScopes: [options.scope],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: { ...(options.properties ?? {}), projectId: projectProperty },
      required: options.required,
      additionalProperties: false
    },
    handler: async (args) => {
      const query = pick(withProject(args.projectId), args, options.queryKeys ?? []);
      return shapeResponse(await request('GET', options.path(args), { query }), { maxItems: options.maxItems ?? 100 });
    }
  };
}

/** A write tool that POSTs (or PATCHes/DELETEs) to a path, sending the project id the way the endpoint expects. */
function writeTool(options: {
  name: string;
  title: string;
  description: string;
  scope: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: (args: JsonObject) => string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  bodyKeys?: string[];
  /** Where the project id goes: the JSON body (default) or the query string. */
  projectIn?: 'body' | 'query';
  destructive?: boolean;
  idempotent?: boolean;
}): Tool {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    requiredScopes: [options.scope],
    annotations: { readOnlyHint: false, destructiveHint: options.destructive ?? false, idempotentHint: options.idempotent ?? false },
    schema: {
      type: 'object',
      properties: { ...(options.properties ?? {}), projectId: projectProperty },
      required: options.required,
      additionalProperties: false
    },
    handler: async (args) => {
      const projectInQuery = options.projectIn === 'query';
      const body = pick(projectInQuery ? {} : withProject(args.projectId), args, options.bodyKeys ?? []);
      const sendBody = options.method !== 'DELETE' && (options.bodyKeys?.length || !projectInQuery);
      return shapeResponse(
        await request(options.method, options.path(args), {
          query: projectInQuery ? withProject(args.projectId) : undefined,
          body: sendBody ? body : undefined
        })
      );
    }
  };
}

const filtersProperty: SchemaProperty = {
  type: 'array',
  items: { type: 'object' },
  description:
    'Optional filters, each {"field", "operator", "value"}. Operators: is, is_not, contains, is_set, is_not_set. Fields are event properties, or os, device, browser, country.'
};

export const productTools: Tool[] = [
  // ---- Open-ended queries ---------------------------------------------------

  {
    name: 'run_insight_query',
    title: 'Run an insight query',
    description: [
      'Ask an ad-hoc question the fixed tools do not cover, using the same engine as dashboard insights.',
      'type "trend": an event over time (event, measure count | unique | sum | avg, property for sum/avg, breakdown by a property, interval hour | day | week).',
      'type "top_events": the busiest events. "retention": weekly cohorts (weeks). "funnel": a saved funnel (funnelId).',
      '"web_analytics", "api_performance" and "errors" return those reports for the window.',
      'Window: days (default 30), or from/to ISO dates. Filters narrow any of them.'
    ].join(' '),
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['trend', 'kpi', 'top_events', 'event_breakdown', 'retention', 'funnel', 'web_analytics', 'api_performance', 'errors'],
          default: 'trend',
          description: 'What to compute.'
        },
        event: { type: 'string', description: 'Event name for trends, e.g. "signup_completed". Omit or "*" for all events.' },
        measure: { type: 'string', enum: ['count', 'unique', 'sum', 'avg'], description: 'count (default), unique users, or sum/avg of a numeric property.' },
        property: { type: 'string', description: 'Numeric property for sum/avg, e.g. "amount".' },
        breakdown: { type: 'string', description: 'Split the result by this property, e.g. "plan" or "country".' },
        interval: { type: 'string', enum: ['hour', 'day', 'week'], description: 'Bucket size for trends.' },
        days: { type: 'integer', description: 'Look-back window in days (default 30).' },
        from: { type: 'string', description: 'Start of a custom window (ISO date). Overrides days.' },
        to: { type: 'string', description: 'End of a custom window (ISO date).' },
        weeks: { type: 'integer', description: 'Cohort weeks for retention (default 4).' },
        funnelId: { type: 'string', description: 'Saved funnel id for type "funnel".' },
        filters: filtersProperty,
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query: Record<string, JsonValue> = {};
      pick(query, args, ['event', 'measure', 'property', 'breakdown', 'interval', 'from', 'to', 'funnelId']);
      if (args.days !== undefined) query.days = String(args.days);
      if (args.weeks !== undefined) query.weeks = String(args.weeks);
      if (query.measure && ['sum', 'avg'].includes(String(query.measure)) && !query.property) {
        throw new Error(`measure "${query.measure}" needs a numeric "property" to aggregate.`);
      }
      if (args.type === 'funnel' && !query.funnelId) {
        throw new Error('type "funnel" needs a "funnelId" (see list_funnels).');
      }
      const body: Record<string, JsonValue> = { ...withProject(args.projectId), type: (args.type as string) ?? 'trend', query };
      if (Array.isArray(args.filters) && args.filters.length) body.filters = args.filters;
      return shapeResponse(await request('POST', '/v1/dashboard/insights/query', { body }), { maxItems: 120 });
    }
  },

  // ---- Dashboards -----------------------------------------------------------

  readTool({
    name: 'list_dashboards',
    title: 'List dashboards',
    description: 'Saved dashboards with their names, owners, tags and widget counts.',
    scope: 'dashboards:read',
    path: () => '/v1/dashboard/dashboards'
  }),

  readTool({
    name: 'get_dashboard',
    title: 'Dashboard detail',
    description: 'One dashboard with its widgets and the insight behind each one.',
    scope: 'dashboards:read',
    path: (args) => `/v1/dashboard/dashboards/${id(args.dashboardId)}`,
    properties: { dashboardId: { type: 'string', description: 'The dashboard id, from list_dashboards.' } },
    required: ['dashboardId']
  }),

  writeTool({
    name: 'create_dashboard',
    title: 'Create a dashboard',
    description: 'Create an empty dashboard, then fill it with add_dashboard_widget. Non-destructive.',
    scope: 'dashboards:write',
    method: 'POST',
    path: () => '/v1/dashboard/dashboards',
    properties: {
      name: { type: 'string', description: 'Dashboard name, e.g. "Checkout health".' },
      description: { type: 'string', description: 'Optional description.' },
      isShared: { type: 'boolean', description: 'Share with the whole organization (default private).' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' }
    },
    required: ['name'],
    bodyKeys: ['name', 'description', 'isShared', 'tags']
  }),

  {
    name: 'add_dashboard_widget',
    title: 'Add a dashboard widget',
    description:
      'Add a chart to a dashboard: either an existing saved insight (insightId), or a new one built from the same fields as run_insight_query (type, event, measure, breakdown, interval, days). Non-destructive.',
    requiredScopes: ['dashboards:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    schema: {
      type: 'object',
      properties: {
        dashboardId: { type: 'string', description: 'The dashboard to add to.' },
        title: { type: 'string', description: 'Widget title, e.g. "Signups per day".' },
        insightId: { type: 'string', description: 'Use an existing saved insight instead of defining one.' },
        type: { type: 'string', enum: ['trend', 'kpi', 'top_events', 'event_breakdown', 'retention', 'funnel', 'web_analytics', 'api_performance', 'errors'], description: 'Insight type for a new widget.' },
        event: { type: 'string', description: 'Event for trend or kpi widgets.' },
        measure: { type: 'string', enum: ['count', 'unique', 'sum', 'avg'], description: 'How to measure the event.' },
        property: { type: 'string', description: 'Numeric property for sum/avg.' },
        breakdown: { type: 'string', description: 'Property to split by.' },
        interval: { type: 'string', enum: ['hour', 'day', 'week'], description: 'Bucket size.' },
        days: { type: 'integer', description: 'Window in days.' },
        funnelId: { type: 'string', description: 'Saved funnel for a funnel widget.' },
        chart: { type: 'string', enum: ['line', 'bar', 'area', 'number', 'table', 'pie'], description: 'Chart style (default line, or number for kpi).' },
        projectId: projectProperty
      },
      required: ['dashboardId', 'title'],
      additionalProperties: false
    },
    handler: async (args) => {
      const body: Record<string, JsonValue> = { ...withProject(args.projectId), title: args.title as string };
      if (args.insightId) {
        body.insightId = args.insightId as string;
      } else {
        if (!args.type) throw new Error('Pass an "insightId", or a "type" (and its fields) for a new insight.');
        const query = pick({}, args, ['event', 'measure', 'property', 'breakdown', 'interval', 'funnelId']);
        if (args.days !== undefined) query.days = String(args.days);
        body.newInsight = {
          name: args.title as string,
          type: args.type as string,
          query,
          visualization: { chartType: (args.chart as string) ?? (args.type === 'kpi' ? 'number' : 'line') }
        };
      }
      return shapeResponse(await request('POST', `/v1/dashboard/dashboards/${id(args.dashboardId)}/widgets`, { body }));
    }
  },

  // ---- Experiments ----------------------------------------------------------

  readTool({
    name: 'list_experiments',
    title: 'List experiments',
    description: 'A/B experiments with their status (draft, running, paused, completed), variants and primary metric.',
    scope: 'experiments:read',
    path: () => '/v1/dashboard/experiments'
  }),

  readTool({
    name: 'get_experiment_results',
    title: 'Experiment results',
    description: 'Results of one experiment: exposures and conversions per variant, lift against control, and statistical significance.',
    scope: 'experiments:read',
    path: (args) => `/v1/dashboard/experiments/${id(args.experimentId)}/results`,
    properties: { experimentId: { type: 'string', description: 'The experiment id, from list_experiments.' } },
    required: ['experimentId']
  }),

  writeTool({
    name: 'create_experiment',
    title: 'Create an experiment',
    description:
      'Create a draft A/B experiment. Without variants it gets a 50/50 control and variant B. It does not start until set_experiment_status sets it running. Non-destructive.',
    scope: 'experiments:write',
    method: 'POST',
    path: () => '/v1/dashboard/experiments',
    properties: {
      key: { type: 'string', description: 'Stable key the SDK evaluates, e.g. "new-pricing-page".' },
      name: { type: 'string', description: 'Human name.' },
      primaryMetric: { type: 'string', description: 'Event that counts as success, e.g. "checkout_completed".' },
      description: { type: 'string', description: 'Optional hypothesis or notes.' },
      secondaryMetrics: { type: 'array', items: { type: 'string' }, description: 'Other events to track.' },
      environment: { type: 'string', description: 'Optional environment, e.g. "production".' }
    },
    required: ['key', 'name', 'primaryMetric'],
    bodyKeys: ['key', 'name', 'primaryMetric', 'description', 'secondaryMetrics', 'environment']
  }),

  writeTool({
    name: 'set_experiment_status',
    title: 'Start, pause or finish an experiment',
    description:
      'Move an experiment between draft, running, paused, completed and archived. Completing can record the winning variant. Changes what users are served, so confirm with the user before starting or stopping one.',
    scope: 'experiments:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/experiments/${id(args.experimentId)}/status`,
    properties: {
      experimentId: { type: 'string', description: 'The experiment id.' },
      status: { type: 'string', enum: ['draft', 'running', 'paused', 'completed', 'archived'], description: 'New status.' },
      winnerVariantKey: { type: 'string', description: 'When completing, the variant that won.' }
    },
    required: ['experimentId', 'status'],
    bodyKeys: ['status', 'winnerVariantKey'],
    idempotent: true
  }),

  // ---- Surveys --------------------------------------------------------------

  readTool({
    name: 'list_surveys',
    title: 'List surveys',
    description: 'In-app surveys with their status, questions and response counts.',
    scope: 'surveys:read',
    path: () => '/v1/dashboard/surveys'
  }),

  readTool({
    name: 'get_survey_results',
    title: 'Survey results',
    description: 'Responses to one survey, aggregated per question (choice counts, rating and NPS scores, and recent text answers).',
    scope: 'surveys:read',
    path: (args) => `/v1/dashboard/surveys/${id(args.surveyId)}/results`,
    properties: { surveyId: { type: 'string', description: 'The survey id, from list_surveys.' } },
    required: ['surveyId']
  }),

  writeTool({
    name: 'set_survey_status',
    title: 'Publish, pause or close a survey',
    description: 'Move a survey between draft, published, paused, closed and archived. Publishing shows it to users, so confirm with the user first.',
    scope: 'surveys:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/surveys/${id(args.surveyId)}/status`,
    properties: {
      surveyId: { type: 'string', description: 'The survey id.' },
      status: { type: 'string', enum: ['draft', 'published', 'paused', 'closed', 'archived'], description: 'New status.' }
    },
    required: ['surveyId', 'status'],
    bodyKeys: ['status'],
    idempotent: true
  }),

  // ---- Cohorts --------------------------------------------------------------

  readTool({
    name: 'list_cohorts',
    title: 'List cohorts',
    description: 'Saved cohorts (groups of users defined by filters) with their definitions.',
    scope: 'cohorts:read',
    path: () => '/v1/dashboard/cohorts'
  }),

  writeTool({
    name: 'create_cohort',
    title: 'Create a cohort',
    description: 'Save a cohort from filters, e.g. users on plan "pro" in Nigeria, to reuse across insights. Non-destructive.',
    scope: 'cohorts:write',
    method: 'POST',
    path: () => '/v1/dashboard/cohorts',
    properties: {
      name: { type: 'string', description: 'Cohort name.' },
      filters: { ...filtersProperty, description: `${filtersProperty.description} At least one is required.` }
    },
    required: ['name', 'filters'],
    bodyKeys: ['name', 'filters']
  }),

  writeTool({
    name: 'delete_cohort',
    title: 'Delete a cohort',
    description: 'Permanently delete a saved cohort. Insights that used it lose that filter. Confirm with the user first.',
    scope: 'cohorts:write',
    method: 'DELETE',
    path: (args) => `/v1/dashboard/cohorts/${id(args.cohortId)}`,
    properties: { cohortId: { type: 'string', description: 'The cohort id, from list_cohorts.' } },
    required: ['cohortId'],
    projectIn: 'query',
    destructive: true
  }),

  // ---- Synthetic monitors ---------------------------------------------------

  readTool({
    name: 'list_synthetic_monitors',
    title: 'List synthetic monitors',
    description: 'Scripted checks that run on a schedule against your app: status, schedule, last result and pass rate.',
    scope: 'synthetic_monitors:read',
    path: () => '/v1/dashboard/synthetic-monitors'
  }),

  readTool({
    name: 'get_synthetic_monitor_runs',
    title: 'Synthetic monitor runs',
    description: 'Recent runs of one monitor, newest first, with pass/fail, duration and the failing step.',
    scope: 'synthetic_monitors:read',
    path: (args) => `/v1/dashboard/synthetic-monitors/${id(args.monitorId)}/runs`,
    properties: {
      monitorId: { type: 'string', description: 'The monitor id, from list_synthetic_monitors.' },
      limit: { type: 'integer', description: 'Max runs (default 20).' }
    },
    required: ['monitorId'],
    queryKeys: ['limit']
  }),

  writeTool({
    name: 'run_synthetic_monitor',
    title: 'Run a synthetic monitor now',
    description: 'Queue an immediate run of a monitor, e.g. to check a fix. Read the result with get_synthetic_monitor_runs.',
    scope: 'synthetic_monitors:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/synthetic-monitors/${id(args.monitorId)}/run`,
    properties: { monitorId: { type: 'string', description: 'The monitor id.' } },
    required: ['monitorId'],
    projectIn: 'query'
  }),

  writeTool({
    name: 'set_synthetic_monitor_paused',
    title: 'Pause or resume a synthetic monitor',
    description: 'Pause a monitor (for planned maintenance) or resume it. Reversible.',
    scope: 'synthetic_monitors:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/synthetic-monitors/${id(args.monitorId)}/${args.paused ? 'pause' : 'resume'}`,
    properties: {
      monitorId: { type: 'string', description: 'The monitor id.' },
      paused: { type: 'boolean', description: 'true to pause, false to resume.' }
    },
    required: ['monitorId', 'paused'],
    projectIn: 'query',
    idempotent: true
  }),

  // ---- Webhooks -------------------------------------------------------------

  readTool({
    name: 'list_webhooks',
    title: 'List webhooks',
    description: 'Webhook endpoints with their events, status (active, paused, failing, disabled) and recent failure counts.',
    scope: 'webhooks:read',
    path: () => '/v1/dashboard/webhooks'
  }),

  readTool({
    name: 'list_webhook_deliveries',
    title: 'Webhook deliveries',
    description: 'Recent deliveries for one webhook, with response status, error and attempts. Filter by status (e.g. "failed") or event.',
    scope: 'webhooks:read',
    path: (args) => `/v1/dashboard/webhooks/${id(args.webhookId)}/deliveries`,
    properties: {
      webhookId: { type: 'string', description: 'The webhook id, from list_webhooks.' },
      status: { type: 'string', description: 'Only deliveries with this status, e.g. "failed".' },
      event: { type: 'string', description: 'Only this event type.' },
      limit: { type: 'integer', description: 'Max deliveries (default 25).' }
    },
    required: ['webhookId'],
    queryKeys: ['status', 'event', 'limit']
  }),

  writeTool({
    name: 'retry_webhook_delivery',
    title: 'Retry a webhook delivery',
    description: 'Send one failed delivery again, e.g. after the receiving endpoint is fixed.',
    scope: 'webhooks:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/webhooks/deliveries/${id(args.deliveryId)}/retry`,
    properties: { deliveryId: { type: 'string', description: 'The delivery id, from list_webhook_deliveries.' } },
    required: ['deliveryId'],
    projectIn: 'query'
  }),

  writeTool({
    name: 'test_webhook',
    title: 'Send a test webhook',
    description: 'Send a test event to a webhook endpoint and report how it responded.',
    scope: 'webhooks:write',
    method: 'POST',
    path: (args) => `/v1/dashboard/webhooks/${id(args.webhookId)}/test`,
    properties: { webhookId: { type: 'string', description: 'The webhook id.' } },
    required: ['webhookId'],
    projectIn: 'query'
  })
];

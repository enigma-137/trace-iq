import { request } from './client.js';
import { compactTimeline, shapeResponse } from './shape.js';
import { Tool, JsonObject, JsonValue } from './types.js';

function withProject(projectId?: string): Record<string, JsonValue> {
  return projectId ? { projectId } : {};
}

export const tools: Tool[] = [
  // ---- Projects -----------------------------------------------------------

  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'List the TraceIQ projects accessible with the configured token, including the viewer role on each. Use this first to discover project ids.',
    requiredScopes: ['projects:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    handler: async () => {
      return shapeResponse(await request('GET', '/v1/dashboard/projects'), { maxItems: 100 });
    }
  },

  // ---- Analytics ----------------------------------------------------------

  {
    name: 'get_analytics_overview',
    title: 'Analytics overview',
    description: `Headline health of a project: total events, active users, sessions (last 30d), revenue, top events/devices/countries, and the recent event sparkline. Good for a high-level "how are we doing?" answer.`,
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project id. Defaults to the first accessible project.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', '/v1/dashboard/overview', { query: withProject(args.projectId as string) }),
        { maxItems: 20 }
      );
    }
  },

  {
    name: 'get_web_analytics',
    title: 'Web analytics',
    description: `Visitors, pageviews, sessions, bounce rate, top pages/devices/countries/sources and active hours, with current vs previous period. Use this to spot traffic changes.`,
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Look-back window in days (1-365). Default 30.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(await request('GET', '/v1/dashboard/web', { query }));
    }
  },

  {
    name: 'get_api_performance',
    title: 'API performance',
    description: `Per-endpoint API latency (p95, avg), error rate and traffic, plus the slowest, most error-prone, busiest, and least-used routes. Answers "is the API healthy?" and "which endpoint is slow?".`,
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Look-back window in days (1-90). Default 7.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(await request('GET', '/v1/dashboard/api-performance', { query }), { maxItems: 50 });
    }
  },

  {
    name: 'list_event_names',
    title: 'Event names',
    description: `List the event names tracked in the project with their counts (highest first). Great for schema discovery, answering "what are my most active events?", and picking events for funnels/trends.`,
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', '/v1/dashboard/insights/event-names', { query: withProject(args.projectId as string) }),
        { maxItems: 100 }
      );
    }
  },

  {
    name: 'get_trends',
    title: 'Event trends',
    description: `Counts / unique users for an event bucketed over time, with period-over-period change. Answers "is X trending up or down?" and "did this event drop recently?".`,
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'The event name to analyze.' },
        interval: { type: 'string', enum: ['hour', 'day', 'week'], default: 'day', description: 'Bucket interval.' },
        days: { type: 'integer', description: 'Look-back window (default 30).' },
        measure: { type: 'string', enum: ['count', 'unique', 'sum', 'avg'], default: 'count', description: 'Metric to chart.' },
        property: { type: 'string', description: 'Property to sum/average (only for sum/avg measure).' },
        breakdown: { type: 'string', description: 'Breakdown series by a property.' },
        filters: { type: 'string', description: 'Optional JSON-encoded filter conditions.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['event'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      query.event = args.event as string;
      if (args.interval !== undefined) query.interval = args.interval;
      if (args.days !== undefined) query.days = args.days;
      if (args.measure !== undefined) query.measure = args.measure;
      if (args.property !== undefined) query.property = args.property;
      if (args.breakdown !== undefined) query.breakdown = args.breakdown;
      if (args.filters !== undefined) query.filters = args.filters;
      return shapeResponse(await request('GET', '/v1/dashboard/insights/trends', { query }));
    }
  },

  {
    name: 'get_retention',
    title: 'User retention',
    description: `Cohort retention table (weekly), size-weighted averages and summarized week-1/week-4 retention. Answers "how well do new users come back?".`,
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        weeks: { type: 'integer', description: 'Number of cohort weeks to compute (default 8).' },
        filters: { type: 'string', description: 'Optional JSON-encoded filter conditions.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.weeks !== undefined) query.weeks = args.weeks;
      if (args.filters !== undefined) query.filters = args.filters;
      return shapeResponse(await request('GET', '/v1/dashboard/retention', { query }));
    }
  },

  // ---- Funnels ------------------------------------------------------------

  {
    name: 'list_funnels',
    title: 'List funnels',
    description: 'List the project’s funnels (id, name, step count). Start here before analyzing a funnel.',
    requiredScopes: ['funnels:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', '/v1/dashboard/funnels', { query: withProject(args.projectId as string) }),
        { maxItems: 100 }
      );
    }
  },

  {
    name: 'get_funnel',
    title: 'Get funnel',
    description: 'Get a funnel’s definition: its ordered steps (event names and labels).',
    requiredScopes: ['funnels:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', `/v1/dashboard/funnels/${encodeURIComponent(args.funnelId as string)}`, {
          query: withProject(args.projectId as string)
        })
      );
    }
  },

  {
    name: 'get_funnel_results',
    title: 'Funnel results',
    description: `Conversion and drop-off for each step of a funnel over a window: count, % of start, % of previous, and people dropped from the previous step. Core data for explaining funnel behavior.`,
    requiredScopes: ['funnels:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id.' },
        days: { type: 'integer', description: 'Look-back window in days (default 30).' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(
        await request('GET', `/v1/dashboard/funnels/${encodeURIComponent(args.funnelId as string)}/results`, { query })
      );
    }
  },

  {
    name: 'get_funnel_step_users',
    title: 'Funnel step users',
    description: 'Users who reached or dropped off at a given funnel step. Use this to enumerate the people behind a conversion change.',
    requiredScopes: ['funnels:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id.' },
        step: { type: 'integer', description: 'Zero-based step index to inspect.' },
        status: { type: 'string', enum: ['reached', 'dropped'], default: 'reached', description: 'Which users to return.' },
        days: { type: 'integer', description: 'Look-back window in days.' },
        limit: { type: 'integer', description: 'Max users to return (default 50, max 200).' },
        offset: { type: 'integer', description: 'Pagination offset.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.step !== undefined) query.step = args.step;
      if (args.status !== undefined) query.status = args.status;
      if (args.days !== undefined) query.days = args.days;
      if (args.limit !== undefined) query.limit = args.limit;
      if (args.offset !== undefined) query.offset = args.offset;
      return shapeResponse(
        await request('GET', `/v1/dashboard/funnels/${encodeURIComponent(args.funnelId as string)}/users`, { query }),
        { maxItems: 200 }
      );
    }
  },

  {
    name: 'summarize_funnel_dropoff',
    title: 'Summarize funnel dropoff',
    description: `Generate a plain-language (LLM) explanation of why drop-off happens in a funnel. Best when you want a narrative answer rather than raw numbers.`,
    requiredScopes: ['funnels:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id.' },
        days: { type: 'integer', description: 'Look-back window in days.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(
        await request('POST', `/v1/dashboard/ai/funnels/${encodeURIComponent(args.funnelId as string)}/summary`, { query })
      );
    }
  },

  // ---- Errors -------------------------------------------------------------

  {
    name: 'list_error_issues',
    title: 'Error issues',
    description: `Aggregated error issues (grouped by type/message) with counts and a daily sparkline. Answers "what errors are increasing?" and "which exceptions are most common?".`,
    requiredScopes: ['errors:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Look-back window in days (default 30).' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(await request('GET', '/v1/dashboard/errors', { query }), { maxItems: 100 });
    }
  },

  {
    name: 'get_error_issue',
    title: 'Error issue detail',
    description: 'Details for one error issue (by type + message): totals, recent samples, and browser/OS breakdown. Deep dive after list_error_issues.',
    requiredScopes: ['errors:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'The error type (from list_error_issues).' },
        message: { type: 'string', description: 'The exact error message (from list_error_issues).' },
        days: { type: 'integer', description: 'Look-back window in days.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['type', 'message'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.type !== undefined) query.type = args.type;
      if (args.message !== undefined) query.message = args.message;
      if (args.days !== undefined) query.days = args.days;
      return shapeResponse(await request('GET', '/v1/dashboard/errors/issue', { query }));
    }
  },

  // ---- Users --------------------------------------------------------------

  {
    name: 'list_users',
    title: 'List users',
    description: 'Paginated list of users (id, external id, traits, event count, first/last seen). Search by fragment to find a specific person.',
    requiredScopes: ['users:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional text to search user ids / traits.' },
        limit: { type: 'integer', description: 'Max users per page (default 50, max 100).' },
        offset: { type: 'integer', description: 'Pagination offset.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.search !== undefined) query.search = args.search;
      if (args.limit !== undefined) query.limit = args.limit;
      if (args.offset !== undefined) query.offset = args.offset;
      return shapeResponse(await request('GET', '/v1/dashboard/users', { query }), { maxItems: 100 });
    }
  },

  {
    name: 'get_user',
    title: 'Get user',
    description: 'Full profile for one user: traits, event/session counts, and last device/country.',
    requiredScopes: ['users:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user id.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['userId'],
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', `/v1/dashboard/users/${encodeURIComponent(args.userId as string)}`, {
          query: withProject(args.projectId as string)
        })
      );
    }
  },

  {
    name: 'get_user_timeline',
    title: 'User timeline',
    description: `A concise, chronological activity feed for one user: recent events with timestamps and key properties. Shaped to fit in context without dumping full payloads.`,
    requiredScopes: ['users:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user id.' },
        keyProps: { type: 'string', description: 'Comma-separated property names to include (e.g. "value,plan,status").' },
        limit: { type: 'integer', description: 'Max events to return (default 50).' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['userId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      if (args.limit !== undefined) query.limit = args.limit;
      const data = (await request('GET', `/v1/dashboard/users/${encodeURIComponent(args.userId as string)}/timeline`, {
        query
      })) as JsonObject;
      const items = (data.items as Array<Record<string, unknown>>) ?? [];
      const keyProps =
        typeof args.keyProps === 'string' && args.keyProps.trim()
          ? args.keyProps.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const limit = typeof args.limit === 'number' ? args.limit : 50;
      return {
        ...data,
        items: compactTimeline(items, keyProps, limit)
      };
    }
  },

  // ---- Feature flags & alerts (read) --------------------------------------

  {
    name: 'list_feature_flags',
    title: 'List feature flags',
    description: 'List the feature flags for a project with their enabled state, rollout, and overrides.',
    requiredScopes: ['flags:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', '/v1/dashboard/flags', { query: withProject(args.projectId as string) }),
        { maxItems: 100 }
      );
    }
  },

  {
    name: 'list_alerts',
    title: 'List alerts',
    description: 'List the configured alerts and the most recent times they fired.',
    requiredScopes: ['alerts:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return shapeResponse(
        await request('GET', '/v1/dashboard/alerts', { query: withProject(args.projectId as string) }),
        { maxItems: 100 }
      );
    }
  },

  // ---- Composed / intent tools --------------------------------------------

  {
    name: 'explain_conversion_drop',
    title: 'Explain conversion drop',
    description: `Analyze a funnel together with site traffic and explain where conversions drop and how overall traffic moved. Returns the biggest drop-off step plus a short, data-backed interpretation. Use this to answer "why did conversions drop?" without stitching raw endpoints yourself.`,
    requiredScopes: ['funnels:read', 'analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id to analyze.' },
        days: { type: 'integer', default: 14, description: 'Look-back window in days.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const funnelId = encodeURIComponent(args.funnelId as string);
      const projectId = args.projectId as string | undefined;
      const days = (args.days as number) ?? 14;

      const results = (await request('GET', `/v1/dashboard/funnels/${funnelId}/results`, {
        query: { ...withProject(projectId), days }
      })) as JsonObject;
      const web = (await request('GET', '/v1/dashboard/web', {
        query: { ...withProject(projectId), days }
      })) as JsonObject;

      const steps = (results.steps as Array<Record<string, unknown>> | undefined) ?? [];
      return {
        funnel: results.funnel,
        days,
        steps: shapeResponse(steps as JsonValue),
        biggestDrop: biggestDrop(steps),
        traffic: siteTrafficChange(web),
        interpretation: funnelInterpretation(steps, siteTrafficChange(web))
      };
    }
  },

  {
    name: 'summarize_api_health',
    title: 'Summarize API health',
    description: `High-level health of a project's API: overall error rate, average/p95 latency, and the slowest, most error-prone, and busiest endpoints. Answers "is the API healthy?" and "what changed?" in one call.`,
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', default: 30, description: 'Look-back window in days.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      const days = (args.days as number) ?? 30;
      query.days = days;
      const data = (await request('GET', '/v1/dashboard/api-performance', { query })) as JsonObject;
      return summarizeApiHealth(data, days);
    }
  },

  {
    name: 'show_retention_changes',
    title: 'Show retention changes',
    description: `Retention cohorts with a plain-language note on how the latest cohorts compare to the average — helps answer "is retention getting better or worse?".`,
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        weeks: { type: 'integer', default: 8, description: 'Number of cohort weeks (default 8).' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId as string);
      const weeks = (args.weeks as number) ?? 8;
      query.weeks = weeks;
      const data = (await request('GET', '/v1/dashboard/retention', { query })) as JsonObject;
      return {
        ...(shapeResponse(data) as JsonObject),
        note: retentionNote(data)
      };
    }
  },

  {
    name: 'find_users_who_failed_checkout',
    title: 'Find users who failed checkout',
    description: `Identify users who reached a funnel but dropped at the final step — potential lost conversions. Takes a funnel and returns the drop-off point plus the users who abandoned it.`,
    requiredScopes: ['funnels:read', 'users:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel representing the checkout (last step = purchase).' },
        step: { type: 'integer', description: 'Optional step index to treat as the checkout step. Defaults to the last step.' },
        limit: { type: 'integer', default: 25, description: 'Max users to return.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const funnelId = encodeURIComponent(args.funnelId as string);
      const base = withProject(args.projectId as string);
      const funnel = (await request('GET', `/v1/dashboard/funnels/${funnelId}`, { query: base })) as JsonObject;
      const steps = (funnel.steps as Array<Record<string, unknown>> | undefined) ?? [];
      const stepIndex = typeof args.step === 'number' ? args.step : Math.max(0, steps.length - 1);
      const limit = (args.limit as number) ?? 25;

      const users = (await request('GET', `/v1/dashboard/funnels/${funnelId}/users`, {
        query: { ...base, step: stepIndex, status: 'dropped', limit }
      })) as JsonObject;

      const stepDef = steps[stepIndex];
      return {
        funnelName: typeof funnel.name === 'string' ? funnel.name : funnel.id,
        checkoutStep: {
          index: stepIndex,
          eventName: stepDef?.eventName ?? null,
          label: stepDef?.label ?? null
        },
        dropped: shapeResponse(users as JsonValue, { maxItems: 200 }),
        note: `These users entered the funnel and dropped before completing step ${stepIndex + 1}.`
      };
    }
  },

  // ---- Guarded mutations --------------------------------------------------

  {
    name: 'toggle_feature_flag',
    title: 'Toggle feature flag',
    description: 'Enable or disable a TraceIQ feature flag. A reversible, targeted change.',
    requiredScopes: ['flags:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    schema: {
      type: 'object',
      properties: {
        flagId: { type: 'string', description: 'TraceIQ feature flag id.' },
        enabled: { type: 'boolean', description: 'Whether the flag should be enabled.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['flagId', 'enabled'],
      additionalProperties: false
    },
    handler: async (args) => {
      return request('PUT', `/v1/dashboard/flags/${encodeURIComponent(args.flagId as string)}`, {
        body: {
          enabled: args.enabled,
          ...(args.projectId !== undefined ? { projectId: args.projectId } : {})
        }
      });
    }
  },

  {
    name: 'create_funnel',
    title: 'Create funnel',
    description: 'Create a funnel from an ordered list of event names. Non-destructive.',
    requiredScopes: ['funnels:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Funnel name.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Ordered event names that define the funnel.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['name', 'steps'],
      additionalProperties: false
    },
    handler: async (args) => {
      return request('POST', '/v1/dashboard/funnels', {
        body: {
          name: args.name,
          steps: args.steps,
          ...(args.projectId !== undefined ? { projectId: args.projectId } : {})
        }
      });
    }
  },

  {
    name: 'update_funnel',
    title: 'Update funnel',
    description: 'Rename a funnel or replace its steps. Non-destructive.',
    requiredScopes: ['funnels:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id.' },
        name: { type: 'string', description: 'New funnel name.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'New ordered event names.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const body: JsonObject = {};
      if (args.name !== undefined) body.name = args.name;
      if (args.steps !== undefined) body.steps = args.steps;
      if (args.projectId !== undefined) body.projectId = args.projectId;
      return request('PUT', `/v1/dashboard/funnels/${encodeURIComponent(args.funnelId as string)}`, { body });
    }
  },

  {
    name: 'delete_funnel',
    title: 'Delete funnel',
    description: 'Permanently delete a funnel and its steps. This cannot be undone.',
    requiredScopes: ['funnels:write'],
    annotations: { readOnlyHint: false, destructiveHint: true },
    schema: {
      type: 'object',
      properties: {
        funnelId: { type: 'string', description: 'The funnel id to delete.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['funnelId'],
      additionalProperties: false
    },
    handler: async (args) => {
      return request('DELETE', `/v1/dashboard/funnels/${encodeURIComponent(args.funnelId as string)}`, {
        query: withProject(args.projectId as string)
      });
    }
  },

  {
    name: 'create_alert',
    title: 'Create alert',
    description: 'Create a metric alert (e.g. "notify when signups drops by 20%"). Non-destructive.',
    requiredScopes: ['alerts:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Alert name.' },
        eventName: { type: 'string', description: 'The event to watch.' },
        measure: { type: 'string', enum: ['count', 'unique', 'sum', 'avg'], default: 'count' },
        property: { type: 'string', description: 'Property for sum/avg measures.' },
        condition: { type: 'string', enum: ['above', 'below', 'drops_by', 'spikes_by'], default: 'above' },
        threshold: { type: 'number', description: 'Trigger threshold.' },
        windowHours: { type: 'integer', default: 24, description: 'Evaluation window in hours.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['name', 'eventName', 'threshold'],
      additionalProperties: false
    },
    handler: async (args) => {
      const body: JsonObject = {
        name: args.name,
        eventName: args.eventName,
        threshold: args.threshold
      };
      if (args.measure !== undefined) body.measure = args.measure;
      if (args.property !== undefined) body.property = args.property;
      if (args.condition !== undefined) body.condition = args.condition;
      if (args.windowHours !== undefined) body.windowHours = args.windowHours;
      if (args.projectId !== undefined) body.projectId = args.projectId;
      return request('POST', '/v1/dashboard/alerts', { body });
    }
  },

  {
    name: 'set_alert_enabled',
    title: 'Enable/disable alert',
    description: 'Enable or disable an existing alert. Reversible.',
    requiredScopes: ['alerts:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    schema: {
      type: 'object',
      properties: {
        alertId: { type: 'string', description: 'The alert id.' },
        enabled: { type: 'boolean', description: 'Whether the alert should be active.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['alertId', 'enabled'],
      additionalProperties: false
    },
    handler: async (args) => {
      return request('PUT', `/v1/dashboard/alerts/${encodeURIComponent(args.alertId as string)}`, {
        body: {
          enabled: args.enabled,
          ...(args.projectId !== undefined ? { projectId: args.projectId } : {})
        }
      });
    }
  },

  {
    name: 'delete_alert',
    title: 'Delete alert',
    description: 'Permanently delete an alert. This cannot be undone.',
    requiredScopes: ['alerts:write'],
    annotations: { readOnlyHint: false, destructiveHint: true },
    schema: {
      type: 'object',
      properties: {
        alertId: { type: 'string', description: 'The alert id to delete.' },
        projectId: { type: 'string', description: 'Optional project id.' }
      },
      required: ['alertId'],
      additionalProperties: false
    },
    handler: async (args) => {
      return request('DELETE', `/v1/dashboard/alerts/${encodeURIComponent(args.alertId as string)}`, {
        query: withProject(args.projectId as string)
      });
    }
  }
];

// ---- Composed-tool helpers -------------------------------------------------

type StepRow = Record<string, unknown>;

function biggestDrop(steps: StepRow[]): unknown {
  if (steps.length < 2) return null;
  let worst: StepRow | null = null;
  let worstRate = -1;
  for (let i = 1; i < steps.length; i += 1) {
    const rate = typeof steps[i].conversionFromPrevious === 'number' ? (steps[i].conversionFromPrevious as number) : 1;
    const dropRate = (1 - rate) * 100;
    if (dropRate > worstRate) {
      worstRate = dropRate;
      worst = steps[i];
    }
  }
  if (!worst) return null;
  return {
    eventName: worst.eventName ?? null,
    label: worst.label ?? null,
    droppedFromPrevious: worst.droppedFromPrevious ?? 0,
    dropRatePct: Math.round(worstRate * 10) / 10
  };
}

function siteTrafficChange(web: JsonObject): JsonValue | null {
  const current = (web.current as Record<string, unknown> | undefined) ?? {};
  const previous = (web.previous as Record<string, unknown> | undefined) ?? {};
  const build = (key: string): JsonValue | null => {
    const now = current[key];
    const prev = previous[key];
    if (typeof now !== 'number' || typeof prev !== 'number') return null;
    const change = prev === 0 ? null : Math.round(((now - prev) / prev) * 1000) / 10;
    return { current: now, previous: prev, changePct: change };
  };
  const visitors = build('visitors');
  const pageviews = build('pageviews');
  if (!visitors && !pageviews) return null;
  return { visitors, pageviews };
}

function funnelInterpretation(steps: StepRow[], traffic: JsonValue | null): string {
  const drop = biggestDrop(steps);
  const parts: string[] = [];
  if (steps.length < 2) {
    return 'This funnel does not have enough steps to analyze a dropout.';
  }
  if (drop && typeof drop === 'object') {
    parts.push(
      `The biggest drop-off is at step "${(drop as JsonObject).label ?? (drop as JsonObject).eventName}" where ${(drop as JsonObject).dropRatePct}% of users left the previous step.`
    );
  } else {
    parts.push('Conversions hold steady across all steps.');
  }
  if (traffic && typeof traffic === 'object') {
    const visitors = (traffic as JsonObject).visitors as JsonObject | null;
    if (visitors && typeof visitors.changePct === 'number') {
      parts.push(
        visitors.changePct >= 0
          ? `Site traffic is up ${visitors.changePct}% period-over-period, so a funnel drop is not caused by declining visitors.`
          : `Site traffic is down ${Math.abs(visitors.changePct)}% period-over-period, which may partly explain lower conversion counts.`
      );
    }
  }
  return parts.join(' ');
}

function summarizeApiHealth(data: JsonObject, days: number): unknown {
  const summary = (data.summary as Record<string, unknown>) ?? {};
  const pickTop = (key: string): JsonValue => {
    const rows = data[key];
    if (!Array.isArray(rows)) return [];
    return shapeResponse(rows.slice(0, 6) as JsonValue);
  };
  const errorRate = typeof summary.errorRate === 'number' ? summary.errorRate : null;
  const verdict =
    errorRate === null
      ? 'No API traffic recorded in this window.'
      : errorRate === 0
        ? 'No errors recorded — the API looks healthy.'
        : errorRate > 5
          ? `Error rate is high (${errorRate}%) and needs attention.`
          : `Error rate is acceptable (${errorRate}%).`;
  return {
    days,
    verdict,
    summary,
    slowestEndpoints: pickTop('highestLatency'),
    mostErrorProne: pickTop('highestError'),
    busiestEndpoints: pickTop('mostRequests')
  };
}

function retentionNote(data: JsonObject): string {
  const summary = (data.summary as Record<string, unknown>) ?? {};
  const week1 = summary.week1;
  const week4 = summary.week4;
  if (typeof week1 !== 'number' && typeof week4 !== 'number') {
    return 'Not enough cohorts to compare retention yet.';
  }
  const parts: string[] = [];
  if (typeof week1 === 'number') parts.push(`Week-1 retention is ${week1}%.`);
  if (typeof week4 === 'number') parts.push(`Week-4 retention is ${week4}%.`);
  return parts.join(' ');
}
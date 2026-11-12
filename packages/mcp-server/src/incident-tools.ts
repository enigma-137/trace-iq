import { ApiError, request } from './client.js';
import { shapeResponse } from './shape.js';
import { JsonObject, JsonValue, Tool } from './types.js';

/**
 * Tools for the "something is wrong, what happened?" loop: today's story, live health,
 * logs, requests, error triage, replays, and one composite investigation. They wrap
 * dashboard endpoints that already check PAT scopes.
 */

const WINDOWS = ['15m', '1h', '6h', '24h', '7d'] as const;
type Window = (typeof WINDOWS)[number];

const WINDOW_MINUTES: Record<Window, number> = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440, '7d': 10_080 };

function windowRange(window: Window, now = Date.now()): { from: string; to: string } {
  return { from: new Date(now - WINDOW_MINUTES[window] * 60_000).toISOString(), to: new Date(now).toISOString() };
}

function withProject(projectId: unknown): Record<string, JsonValue> {
  return typeof projectId === 'string' && projectId ? { projectId } : {};
}

function pick(query: Record<string, JsonValue>, args: JsonObject, keys: string[]): Record<string, JsonValue> {
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== '') query[key] = value;
  }
  return query;
}

/** Runs a sub-request for a composite tool; a missing scope or failure becomes a note instead of failing the whole answer. */
async function attempt<T>(label: string, run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; note: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    const reason = status === 403 ? 'the token lacks the scope for it' : error instanceof Error ? error.message : 'request failed';
    return { ok: false, note: `${label} unavailable: ${reason}.` };
  }
}

const windowProperty = {
  type: 'string' as const,
  enum: [...WINDOWS],
  description: 'How far back to look: 15m, 1h, 6h, 24h or 7d.'
};

const projectProperty = { type: 'string' as const, description: 'Optional project id. Defaults to the first accessible project.' };

export const incidentTools: Tool[] = [
  {
    name: 'get_today_story',
    title: "Today's story",
    description:
      "The plain-English story of the last 24 hours that opens the TraceIQ Overview: what happened, what failed (and whether the backend has recovered), the top event and where traffic came from, plus the numbers behind it. A good first call for \"what's going on today?\".",
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: { type: 'object', properties: { projectId: projectProperty }, additionalProperties: false },
    handler: async (args) => {
      const story = (await request('GET', '/v1/dashboard/insights/story', { query: withProject(args.projectId) })) as JsonObject;
      return shapeResponse({ project: story.project ?? null, narrative: story.narrative ?? null, generatedAt: story.generatedAt ?? null, facts: story.facts ?? null });
    }
  },

  {
    name: 'get_project_health',
    title: 'Project health',
    description:
      'Live health from recent data, not alert rules: operational, degraded, outage or idle, with a one-line summary and the failures behind it (requests with no response, 5xx, exceptions, failed actions, affected users). Answers "is it down right now?".',
    requiredScopes: ['insights:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        minutes: { type: 'integer', default: 60, description: 'Look-back window in minutes (5 to 1440). Default 60.' },
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = withProject(args.projectId);
      query.minutes = Math.min(Math.max(Math.trunc((args.minutes as number) ?? 60), 5), 1440);
      return shapeResponse(await request('GET', '/v1/dashboard/insights/health', { query }));
    }
  },

  {
    name: 'search_logs',
    title: 'Search logs',
    description:
      'Search log lines (SDK logs, mirrored events and request logs) newest first. Filter by level, source, free text, or by a trace, request, session or user id to follow one flow. Returns the entries plus total counts.',
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        window: { ...windowProperty, default: '24h' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'], description: 'Only this level.' },
        source: { type: 'string', description: 'Only this source or service name, e.g. "app" or "traceiq-ingest".' },
        search: { type: 'string', description: 'Free text matched against the message.' },
        traceId: { type: 'string', description: 'Only lines from this trace.' },
        requestId: { type: 'string', description: 'Only lines for this request.' },
        sessionId: { type: 'string', description: 'Only lines from this session.' },
        distinctId: { type: 'string', description: 'Only lines for this user or anonymous id.' },
        limit: { type: 'integer', default: 50, description: 'Max entries (1 to 200).' },
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query: Record<string, JsonValue> = { ...withProject(args.projectId), ...windowRange((args.window as Window) ?? '24h') };
      pick(query, args, ['level', 'source', 'search', 'traceId', 'requestId', 'sessionId', 'distinctId']);
      query.limit = Math.min(Math.max((args.limit as number) ?? 50, 1), 200);
      return shapeResponse(await request('GET', '/v1/dashboard/logs', { query }), { maxItems: 200 });
    }
  },

  {
    name: 'get_log',
    title: 'Log entry',
    description: 'One log entry with all its fields, plus the other entries in the same trace so you can see what happened before and after it.',
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        logId: { type: 'string', description: 'The log id, from search_logs.' },
        includeTrace: { type: 'boolean', default: true, description: 'Also return the rest of the trace.' },
        projectId: projectProperty
      },
      required: ['logId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const id = encodeURIComponent(args.logId as string);
      const query = withProject(args.projectId);
      const detail = (await request('GET', `/v1/dashboard/logs/${id}`, { query })) as JsonObject;
      if (args.includeTrace === false) return shapeResponse(detail);
      const trace = await attempt('Trace', () => request('GET', `/v1/dashboard/logs/${id}/trace`, { query }));
      return shapeResponse({ log: detail.log ?? null, trace: trace.ok ? trace.value : null, ...(trace.ok ? {} : { note: trace.note }) }, { maxItems: 100 });
    }
  },

  {
    name: 'search_requests',
    title: 'Search API requests',
    description:
      'API requests captured by the SDKs, newest or slowest first, with a summary (count, error rate, latency percentiles) for the same filter. Status filter: "2xx"…"5xx", an exact code like "404", "error" (5xx or no response) or "failed" (no response at all).',
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        window: { ...windowProperty, default: '24h' },
        status: { type: 'string', description: 'e.g. "5xx", "4xx", "404", "error" or "failed".' },
        method: { type: 'string', description: 'HTTP method, e.g. POST.' },
        route: { type: 'string', description: 'Only this route, e.g. /api/auth/login.' },
        search: { type: 'string', description: 'Free text matched against the path.' },
        service: { type: 'string', description: 'Only this service.' },
        source: { type: 'string', enum: ['all', 'server', 'client'], description: 'Server middleware, browser capture, or both (default).' },
        sort: { type: 'string', enum: ['time', 'duration'], default: 'time', description: 'Newest first, or slowest first.' },
        limit: { type: 'integer', default: 25, description: 'Max requests (1 to 100).' },
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query: Record<string, JsonValue> = { ...withProject(args.projectId), ...windowRange((args.window as Window) ?? '24h') };
      pick(query, args, ['status', 'method', 'route', 'search', 'service', 'source', 'sort']);
      const listQuery = { ...query, limit: Math.min(Math.max((args.limit as number) ?? 25, 1), 100) };
      const [summary, list] = await Promise.all([
        attempt('Summary', () => request('GET', '/v1/dashboard/requests/summary', { query })),
        request('GET', '/v1/dashboard/requests', { query: listQuery })
      ]);
      return shapeResponse({ summary: summary.ok ? summary.value : null, ...(list as JsonObject) }, { maxItems: 100 });
    }
  },

  {
    name: 'get_request',
    title: 'API request detail',
    description:
      'One API request in full: headers and bodies TraceIQ captured, its timeline (spans, logs and events around it), and related requests from the same trace or session.',
    requiredScopes: ['analytics:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'The request id, from search_requests.' },
        projectId: projectProperty
      },
      required: ['requestId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const id = encodeURIComponent(args.requestId as string);
      const query = withProject(args.projectId);
      const [detail, timeline, related] = await Promise.all([
        request('GET', `/v1/dashboard/requests/${id}`, { query }) as Promise<JsonObject>,
        attempt('Timeline', () => request('GET', `/v1/dashboard/requests/${id}/timeline`, { query })),
        attempt('Related requests', () => request('GET', `/v1/dashboard/requests/${id}/related`, { query }))
      ]);
      const notes = [timeline, related].flatMap((part) => (part.ok ? [] : [part.note]));
      return shapeResponse(
        {
          request: detail.request ?? null,
          timeline: timeline.ok ? timeline.value : null,
          related: related.ok ? related.value : null,
          ...(notes.length ? { notes } : {})
        },
        { maxItems: 100 }
      );
    }
  },

  {
    name: 'update_error_issue',
    title: 'Resolve, ignore or reopen an error issue',
    description:
      'Change an error issue\'s status (resolved, ignored, open) and optionally assign it. Resolving stamps a time, so the issue shows as "regressed" if it happens again. Reversible. Get the issue id from list_error_issues.',
    requiredScopes: ['errors:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    schema: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue id, from list_error_issues.' },
        status: { type: 'string', enum: ['open', 'resolved', 'ignored'], description: 'New status.' },
        assigneeUserId: { type: 'string', description: 'Optional: a member user id, or "me". Omit to leave the assignee unchanged.' },
        projectId: projectProperty
      },
      required: ['issueId'],
      additionalProperties: false
    },
    handler: async (args) => {
      if (args.status === undefined && args.assigneeUserId === undefined) {
        throw new Error('Pass a "status", an "assigneeUserId", or both.');
      }
      const body: Record<string, JsonValue> = { ...withProject(args.projectId) };
      pick(body, args, ['status', 'assigneeUserId']);
      return shapeResponse(await request('PATCH', `/v1/dashboard/errors/issues/${encodeURIComponent(args.issueId as string)}`, { body }));
    }
  },

  {
    name: 'list_replays',
    title: 'Session replays',
    description:
      'Recorded session replays, newest first, optionally for one user, anonymous visitor or session: duration, pages, errors and rage clicks per replay. Use it to watch what a user saw when something failed.',
    requiredScopes: ['replays:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Only replays for this identified user.' },
        anonymousId: { type: 'string', description: 'Only replays for this anonymous visitor.' },
        sessionId: { type: 'string', description: 'Only this session.' },
        limit: { type: 'integer', default: 20, description: 'Max replays (1 to 100).' },
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const query = pick(withProject(args.projectId), args, ['userId', 'anonymousId', 'sessionId']);
      query.limit = Math.min(Math.max((args.limit as number) ?? 20, 1), 100);
      return shapeResponse(await request('GET', '/v1/dashboard/replays', { query }), { maxItems: 100 });
    }
  },

  {
    name: 'investigate_incident',
    title: 'Investigate an incident',
    description:
      'One call for "what is broken?": live health, the failing requests and endpoints, error-level logs, the top error issues, and (when the token can read replays) recordings to watch, all for the same window, with suggested next steps. Parts the token cannot read are skipped with a note.',
    requiredScopes: ['insights:read', 'analytics:read', 'errors:read'],
    annotations: { readOnlyHint: true },
    schema: {
      type: 'object',
      properties: {
        window: { ...windowProperty, default: '1h' },
        projectId: projectProperty
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const window = (args.window as Window) ?? '1h';
      const project = withProject(args.projectId);
      const range = windowRange(window);
      const days = Math.max(1, Math.ceil(WINDOW_MINUTES[window] / 1440));

      const [health, summary, failing, logs, issues, replays] = await Promise.all([
        attempt('Health', () => request('GET', '/v1/dashboard/insights/health', { query: { ...project, minutes: Math.min(WINDOW_MINUTES[window], 1440) } })),
        attempt('Request summary', () => request('GET', '/v1/dashboard/requests/summary', { query: { ...project, ...range } })),
        attempt('Failing requests', () => request('GET', '/v1/dashboard/requests', { query: { ...project, ...range, status: 'error', limit: 15 } })),
        attempt('Error logs', () => request('GET', '/v1/dashboard/logs', { query: { ...project, ...range, level: 'error', limit: 15 } })),
        attempt('Error issues', () => request('GET', '/v1/dashboard/errors', { query: { ...project, days } })),
        attempt('Replays', () => request('GET', '/v1/dashboard/replays', { query: { ...project, limit: 5 } }))
      ]);

      const failingRows = failing.ok ? rowsOf(failing.value, ['requests', 'items', 'rows']) : [];
      const issueRows = issues.ok ? rowsOf(issues.value, ['issues', 'errors', 'items']) : [];
      const notes = [health, summary, failing, logs, issues, replays].flatMap((part) => (part.ok ? [] : [part.note]));

      return shapeResponse(
        {
          window,
          health: health.ok ? health.value : null,
          requests: summary.ok ? summary.value : null,
          failingEndpoints: topEndpoints(failingRows),
          failingRequests: failingRows.slice(0, 10) as JsonValue,
          errorLogs: logs.ok ? logs.value : null,
          topIssues: issueRows.slice(0, 5) as JsonValue,
          replays: replays.ok ? replays.value : null,
          nextSteps: nextSteps(failingRows, issueRows),
          ...(notes.length ? { notes } : {})
        },
        { maxItems: 30 }
      );
    }
  }
];

function rowsOf(value: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === 'object') {
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** "POST /api/login: 12 (status 0 ×10, 502 ×2)" style grouping of failing requests by endpoint. */
export function topEndpoints(rows: Array<Record<string, unknown>>): JsonValue[] {
  const groups = new Map<string, { method: string; route: string; count: number; statuses: Record<string, number> }>();
  for (const row of rows) {
    const method = typeof row.method === 'string' ? row.method : 'GET';
    const route = typeof row.route === 'string' ? row.route : typeof row.path === 'string' ? row.path : '/';
    const status = String(row.statusCode ?? row.status ?? 'unknown');
    const key = `${method} ${route}`;
    const group = groups.get(key) ?? { method, route, count: 0, statuses: {} };
    group.count += 1;
    group.statuses[status] = (group.statuses[status] ?? 0) + 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5) as unknown as JsonValue[];
}

function nextSteps(failing: Array<Record<string, unknown>>, issues: Array<Record<string, unknown>>): string[] {
  const steps: string[] = [];
  const first = failing[0];
  if (first && typeof first.id === 'string') {
    steps.push(`Open the most recent failing request with get_request (requestId "${first.id}") to see its timeline.`);
  }
  if (failing.some((row) => Number(row.statusCode ?? row.status) === 0)) {
    steps.push('Some requests got no response at all: check whether the backend or its proxy is up before reading app errors.');
  }
  const issue = issues[0];
  if (issue && typeof issue.id === 'string') {
    steps.push(`Inspect the top error issue with get_error_issue, and mark it with update_error_issue (issueId "${issue.id}") once fixed.`);
  }
  if (steps.length === 0) steps.push('Nothing is failing in this window. Widen it (6h or 24h) if the problem was earlier.');
  return steps;
}

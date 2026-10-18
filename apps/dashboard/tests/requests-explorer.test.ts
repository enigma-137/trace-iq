import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { navGroups } from '../src/app/dashboard/nav';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  errorIssueHref,
  filtersFromParams,
  filtersToApiQuery,
  filtersToSearch,
  formatBytes,
  formatDuration,
  logsSearchHref,
  requestsHrefForEndpoint,
  requestsSearchHref,
  statusTone
} from '../src/lib/requests';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Requests explorer URL state', () => {
  it('round-trips filters through the URL and drops defaults', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      range: '7d',
      service: 'billing-api',
      method: 'POST',
      status: '5xx',
      capture: 'payload',
      route: '/orders/:id',
      search: 'req-1',
      sort: 'duration' as const,
      request: 'req_abc'
    };
    const search = filtersToSearch(filters, 'proj_1');
    const params = new URLSearchParams(search);
    expect(params.get('projectId')).toBe('proj_1');
    expect(params.has('environment')).toBe(false);
    expect(filtersFromParams(params)).toEqual(filters);
    expect(filtersToSearch(DEFAULT_FILTERS)).toBe('');
  });

  it('sanitizes unknown values from the URL', () => {
    const filters = filtersFromParams({ range: '90d', sort: 'random', method: 'get', from: '2026-01-01T00:00:00Z' });
    expect(filters.range).toBe('24h');
    expect(filters.sort).toBe('time');
    expect(filters.method).toBe('GET');
    // A custom window needs both ends.
    expect(filters.from).toBe('');
  });

  it('builds API queries with either a preset or a custom window, never UI-only keys', () => {
    const preset = new URLSearchParams(filtersToApiQuery({ ...DEFAULT_FILTERS, status: '4xx', request: 'req_1' }, 'proj_1'));
    expect(preset.get('range')).toBe('24h');
    expect(preset.get('status')).toBe('4xx');
    expect(preset.has('request')).toBe(false);
    expect(preset.has('sort')).toBe(false);

    const custom = new URLSearchParams(
      filtersToApiQuery({ ...DEFAULT_FILTERS, from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', sort: 'duration' }, null, {
        cursor: 'abc'
      })
    );
    expect(custom.has('range')).toBe(false);
    expect(custom.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(custom.get('sort')).toBe('duration');
    expect(custom.get('cursor')).toBe('abc');
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, service: 'a', route: '/x', range: '7d' })).toBe(2);
  });
});

describe('API Performance → Requests navigation', () => {
  it('opens Requests prefiltered to the endpoint and matching period', () => {
    const href = requestsHrefForEndpoint({ method: 'get', path: '/users/:id', days: '7', projectId: 'proj_1', sort: 'duration' });
    const params = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/dashboard/requests?')).toBe(true);
    expect(params.get('route')).toBe('/users/:id');
    expect(params.get('method')).toBe('GET');
    expect(params.get('range')).toBe('7d');
    expect(params.get('sort')).toBe('duration');
    expect(params.get('projectId')).toBe('proj_1');
  });

  it('carries the failing status and maps 24h', () => {
    const params = new URLSearchParams(requestsHrefForEndpoint({ path: '/pay', method: 'POST', status: '502', days: '1' }).split('?')[1]);
    expect(params.get('status')).toBe('502');
    expect(params.has('range')).toBe(false); // 24h is the default
  });

  it('turns 14d (no preset) into a custom window', () => {
    const now = new Date('2026-10-15T00:00:00.000Z');
    const params = new URLSearchParams(requestsHrefForEndpoint({ path: '/x', days: '14', now }).split('?')[1]);
    expect(params.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-10-15T00:00:00.000Z');
  });

  it('wires every API Performance endpoint panel to Requests', () => {
    const source = read('../src/app/dashboard/api-performance/page.tsx');
    expect(source).toContain('requestsHrefForEndpoint');
    expect(source.match(/link=\{\{ days, projectId: canonicalProjectId/g)?.length).toBe(4);
    // The flow-architecture overview stays.
    expect(source).toContain('<SvgNodeFlowGraph');
  });

  it('registers Requests under Observability next to API performance', () => {
    const keys = navGroups.find((group) => group.key === 'observability')?.items.map((item) => item.key) ?? [];
    expect(keys.indexOf('requests')).toBe(keys.indexOf('api-performance') + 1);
    expect(read('../src/app/dashboard/NavIcon.tsx')).toContain('requests: ArrowDataTransferHorizontalIcon');
  });
});

describe('correlation links', () => {
  it('links logs within ±1h of the request and errors to the issue view', () => {
    const logs = new URLSearchParams(logsSearchHref('req-1', '2026-10-15T10:00:00.000Z', 'proj_1').split('?')[1]);
    expect(logs.get('search')).toBe('req-1');
    expect(logs.get('from')).toBe('2026-10-15T09:00:00.000Z');
    expect(logs.get('to')).toBe('2026-10-15T11:00:00.000Z');
    expect(errorIssueHref('TypeError', 'x is undefined', 'proj_1')).toBe(
      '/dashboard/errors?type=TypeError&message=x+is+undefined&days=30&projectId=proj_1'
    );
    expect(requestsSearchHref('rid-9', 'proj_1')).toBe('/dashboard/requests?projectId=proj_1&range=30d&search=rid-9');
  });

  it('lets the Logs page honour deep-linked search and window', () => {
    const page = read('../src/app/dashboard/logs/page.tsx');
    expect(page).toContain('initialFilters');
    expect(read('../src/app/dashboard/logs/ObservabilityApp.tsx')).toContain('...initialFilters');
  });

  it('links synthetic run network entries that carry a request id', () => {
    const view = read('../src/app/dashboard/synthetic-monitors/[id]/runs/[runId]/RunDetailView.tsx');
    expect(view).toContain('requestsSearchHref(req.requestId');
    expect(view).toContain('requestsSearchHref(err.requestId');
  });
});

describe('formatting', () => {
  it('formats durations, sizes and status tones', () => {
    expect(formatDuration(0.42)).toBe('0.4 ms');
    expect(formatDuration(42)).toBe('42 ms');
    expect(formatDuration(1530)).toBe('1.53 s');
    expect(formatDuration(null)).toBe('—');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(statusTone(0)).toBe('none');
    expect(statusTone(204)).toBe('success');
    expect(statusTone(302)).toBe('redirect');
    expect(statusTone(404)).toBe('client');
    expect(statusTone(503)).toBe('server');
  });
});

describe('Requests explorer UI', () => {
  const dir = new URL('../src/app/dashboard/requests/', import.meta.url);
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => readFileSync(new URL(file, dir), 'utf8'))
    .join('\n');

  it('follows the design constraints: no gradients, blur, glow or fake live indicators', () => {
    expect(sources).not.toMatch(/gradient|backdrop-blur|blur-|animate-|shadow-2xl|glow/);
    expect(sources).not.toMatch(/\bLive\b/);
  });

  it('never fabricates data: no Math.random or hardcoded sample rows', () => {
    expect(sources).not.toContain('Math.random');
    expect(sources).not.toMatch(/mock|sampleRequests|fakeData/i);
  });

  it('has the five drawer tabs with truthful empty states', () => {
    const drawer = read('../src/app/dashboard/requests/RequestDrawer.tsx');
    for (const tab of ["'request'", "'response'", "'timeline'", "'context'", "'related'"]) expect(drawer).toContain(tab);
    expect(drawer).toContain('No recorded operations for this request.');
    expect(drawer).toContain('never');
    expect(drawer).toContain('guessed from timestamps');
    expect(drawer).toContain('Not recorded for this request');
  });

  it('cancels stale requests and shows loading, empty, error and retry states', () => {
    const explorer = read('../src/app/dashboard/requests/RequestsExplorer.tsx');
    expect(explorer).toContain('AbortController');
    expect(explorer).toContain('Loading requests…');
    expect(explorer).toContain('No requests recorded in this period.');
    expect(explorer).toContain('No requests match these filters');
    expect(explorer).toContain('Retry');
    expect(explorer).toContain('Load more');
  });
});

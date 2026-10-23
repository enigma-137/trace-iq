'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clientFetch } from '@/lib/analytics-api';
import {
  CAPTURE_OPTIONS,
  SOURCE_OPTIONS,
  DEFAULT_FILTERS,
  METHODS,
  STATUS_OPTIONS,
  TIME_RANGES,
  type RequestFilters,
  type RequestListItem,
  type RequestsSummary,
  activeFilterCount,
  filtersFromParams,
  filtersToApiQuery,
  filtersToSearch,
  formatBytes,
  formatDuration
} from '@/lib/requests';
import { CaptureBadge, MethodBadge, StatusBadge } from './RequestBadges';
import { RequestDrawer } from './RequestDrawer';
import { CaptureSettingsPanel } from './CaptureSettingsPanel';

interface ListResponse {
  requests: RequestListItem[];
  nextCursor: string | null;
}

interface Facet {
  value: string;
  count: number;
}

const selectClass =
  'h-8 rounded border border-neutral-200 bg-white px-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export function RequestsExplorer({ projectId, canEditCapture }: { projectId: string | null; canEditCapture: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<RequestFilters>) => {
      const next = { ...filters, ...patch };
      router.replace(`${pathname}?${filtersToSearch(next, projectId)}`, { scroll: false });
    },
    [filters, pathname, projectId, router]
  );

  // ── Search input (debounced into the URL) ──
  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => setFilters({ search: searchDraft.trim(), request: '' }), 350);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, setFilters]);

  // ── Data ──
  const apiQuery = filtersToApiQuery(filters, projectId);
  const [refreshKey, setRefreshKey] = useState(0);
  const [list, setList] = useState<{ rows: RequestListItem[]; cursor: string | null }>({ rows: [], cursor: null });
  const [summary, setSummary] = useState<RequestsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{ services: Facet[]; environments: Facet[] }>({ services: [], environments: [] });
  const inflight = useRef<AbortController | null>(null);
  const currentQuery = useRef(apiQuery);
  currentQuery.current = apiQuery;

  useEffect(() => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLoading(true);
    setError(null);
    void Promise.all([
      clientFetch<ListResponse>(`/v1/dashboard/requests?${apiQuery}`, { signal: controller.signal }),
      clientFetch<{ summary: RequestsSummary }>(`/v1/dashboard/requests/summary?${apiQuery}`, { signal: controller.signal })
    ]).then(([listResult, summaryResult]) => {
      if (controller.signal.aborted) return;
      if (listResult.error || !listResult.data) {
        setError(listResult.error ?? 'Could not load requests.');
        setList({ rows: [], cursor: null });
      } else {
        setList({ rows: listResult.data.requests, cursor: listResult.data.nextCursor });
      }
      setSummary(summaryResult.data?.summary ?? null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [apiQuery, refreshKey]);

  const windowQuery = filtersToApiQuery({ ...DEFAULT_FILTERS, range: filters.range, from: filters.from, to: filters.to }, projectId);
  useEffect(() => {
    const controller = new AbortController();
    void clientFetch<{ services: Facet[]; environments: Facet[] }>(`/v1/dashboard/requests/facets?${windowQuery}`, {
      signal: controller.signal
    }).then(({ data }) => {
      if (!controller.signal.aborted && data) setFacets({ services: data.services, environments: data.environments });
    });
    return () => controller.abort();
  }, [windowQuery, refreshKey]);

  const loadMore = async () => {
    if (!list.cursor || loadingMore) return;
    setLoadingMore(true);
    const queryAtStart = apiQuery;
    const { data, error: moreError } = await clientFetch<ListResponse>(
      `/v1/dashboard/requests?${filtersToApiQuery(filters, projectId, { cursor: list.cursor })}`
    );
    setLoadingMore(false);
    // Filters changed while this page was loading: drop it rather than mixing results.
    if (currentQuery.current !== queryAtStart) return;
    if (moreError || !data) {
      setError(moreError ?? 'Could not load more requests.');
      return;
    }
    setList((prev) => ({ rows: [...prev.rows, ...data.requests], cursor: data.nextCursor }));
  };

  // ── Custom range ──
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const isCustom = !!(filters.from && filters.to);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeDrawer = useCallback(() => setFilters({ request: '' }), [setFilters]);
  const openRequest = useCallback((id: string) => setFilters({ request: id }), [setFilters]);
  const filterCount = activeFilterCount(filters);
  const payloads = summary ? summary.captures.captured + summary.captures.redacted : 0;
  // The drawer takes the right side of the page, so the list drops to its compact columns.
  const wideColumns = filters.request ? '' : 'md:grid-cols-[minmax(0,1fr)_160px_64px_84px_92px_120px]';
  const wideOnly = filters.request ? 'hidden' : 'hidden md:block';

  return (
    <div className={filters.request ? 'lg:pr-[min(44vw,860px)]' : undefined}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search endpoint, service, request ID or trace ID"
            className="h-8 w-full rounded border border-neutral-200 bg-white px-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search requests"
          />
        </div>
        <div className="flex h-8 items-center rounded border border-neutral-200 dark:border-slate-700" role="group" aria-label="Time range">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setFilters({ range, from: '', to: '' })}
              className={`h-full px-2.5 text-xs font-medium ${
                !isCustom && filters.range === range
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {range}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((open) => !open)}
            className={`h-full border-l border-neutral-200 px-2.5 text-xs font-medium dark:border-slate-700 ${
              isCustom
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Custom
          </button>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          className="h-8 rounded border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          className="h-8 rounded border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-expanded={settingsOpen}
        >
          Capture settings
        </button>
      </div>

      {customOpen ? (
        <form
          className="mb-3 flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
          onSubmit={(event) => {
            event.preventDefault();
            const from = new Date(customFrom);
            const to = new Date(customTo);
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return;
            setFilters({ from: from.toISOString(), to: to.toISOString(), request: '' });
            setCustomOpen(false);
          }}
        >
          <label className="flex flex-col gap-1 text-neutral-500 dark:text-slate-400">
            From
            <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={selectClass} required />
          </label>
          <label className="flex flex-col gap-1 text-neutral-500 dark:text-slate-400">
            To
            <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={selectClass} required />
          </label>
          <button type="submit" className="h-8 rounded bg-neutral-900 px-3 font-medium text-white dark:bg-white dark:text-slate-950">
            Apply
          </button>
          <span className="pb-2 text-neutral-500 dark:text-slate-400">Up to 31 days.</span>
        </form>
      ) : null}

      {settingsOpen ? (
        <CaptureSettingsPanel projectId={projectId} canEdit={canEditCapture} onClose={() => setSettingsOpen(false)} />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={selectClass} value={filters.service} onChange={(e) => setFilters({ service: e.target.value, request: '' })} aria-label="Service">
          <option value="">All services</option>
          {withCurrent(facets.services, filters.service).map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.value}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.method} onChange={(e) => setFilters({ method: e.target.value, request: '' })} aria-label="Method">
          <option value="">All methods</option>
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.status} onChange={(e) => setFilters({ status: e.target.value, request: '' })} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {filters.status && !STATUS_OPTIONS.some((o) => o.value === filters.status) ? (
            <option value={filters.status}>Status {filters.status}</option>
          ) : null}
        </select>
        <select className={selectClass} value={filters.environment} onChange={(e) => setFilters({ environment: e.target.value, request: '' })} aria-label="Environment">
          <option value="">All environments</option>
          {withCurrent(facets.environments, filters.environment).map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.value}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.source} onChange={(e) => setFilters({ source: e.target.value, request: '' })} aria-label="Timed by">
          <option value="">Server + browser</option>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.capture} onChange={(e) => setFilters({ capture: e.target.value, request: '' })} aria-label="Capture state">
          <option value="">Any capture state</option>
          {CAPTURE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value === 'duration' ? 'duration' : 'time', request: '' })} aria-label="Sort">
          <option value="time">Newest first</option>
          <option value="duration">Slowest first</option>
        </select>
        {filters.route ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded border border-neutral-300 bg-neutral-50 pl-2 pr-1 font-mono text-xs text-neutral-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            route = {filters.route}
            <button type="button" onClick={() => setFilters({ route: '', request: '' })} className="rounded px-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-slate-800" aria-label="Remove route filter">
              ×
            </button>
          </span>
        ) : null}
        {filterCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearchDraft('');
              setFilters({ ...DEFAULT_FILTERS, range: filters.range, from: filters.from, to: filters.to, sort: filters.sort });
            }}
            className="h-8 px-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
          >
            Clear {filterCount} filter{filterCount === 1 ? '' : 's'}
          </button>
        ) : null}
        {isCustom ? (
          <span className="text-xs text-neutral-500 dark:text-slate-400">
            {new Date(filters.from).toLocaleString()} – {new Date(filters.to).toLocaleString()}
          </span>
        ) : null}
      </div>

      {/* Summary */}
      <section className="mb-4 grid grid-cols-2 gap-px border border-neutral-200 bg-neutral-200 dark:border-slate-800 dark:bg-slate-800 xl:grid-cols-4" aria-label="Summary">
        <Metric label="Total requests" value={summary ? summary.total.toLocaleString() : '—'} hint={isCustom ? 'custom range' : `last ${filters.range}`} />
        <Metric
          label="Error rate"
          value={summary ? `${summary.errorRate}%` : '—'}
          hint={summary ? `${summary.serverErrors.toLocaleString()} server errors (5xx)` : ''}
          tone={summary && summary.serverErrors > 0 ? 'bad' : undefined}
        />
        <Metric label="P95 latency" value={summary && summary.total > 0 ? formatDuration(summary.p95) : '—'} hint="95% of requests were faster" />
        <Metric
          label="Payload captures"
          value={summary ? payloads.toLocaleString() : '—'}
          hint={
            summary
              ? `${summary.captures.redacted.toLocaleString()} redacted · ${(summary.captures.metadataOnly + summary.captures.unavailable).toLocaleString()} metadata only`
              : ''
          }
        />
      </section>

      {/* Table */}
      <section className="border border-neutral-200 dark:border-slate-800">
        <div className={`grid grid-cols-[minmax(0,1fr)_72px_80px] gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 ${wideColumns}`}>
          <span>Request</span>
          <span className={wideOnly}>Service</span>
          <span>Status</span>
          <span className="text-right">Duration</span>
          <span className={`${wideOnly} text-right`}>Transferred</span>
          <span className={wideOnly}>Capture</span>
        </div>

        {loading ? (
          <p className="px-3 py-6 text-xs text-neutral-500 dark:text-slate-400">Loading requests…</p>
        ) : error ? (
          <div className="flex items-center justify-between px-3 py-4 text-xs text-red-700 dark:text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="font-semibold hover:underline">
              Retry
            </button>
          </div>
        ) : list.rows.length === 0 ? (
          <EmptyState filtered={filterCount > 0} />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
            {list.rows.map((row) => {
              const selected = row.id === filters.request;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setFilters({ request: row.id })}
                    aria-current={selected ? 'true' : undefined}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_72px_80px] items-center gap-3 px-3 py-2 text-left ${wideColumns} ${
                      selected
                        ? 'bg-blue-50 shadow-[inset_2px_0_0_0_#2563eb] dark:bg-slate-800 dark:shadow-[inset_2px_0_0_0_#fff]'
                        : 'hover:bg-neutral-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <MethodBadge method={row.method} />
                        <span className="truncate font-mono text-[13px] font-medium text-neutral-900 dark:text-slate-100" title={row.route}>
                          {row.route}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[60px] text-[11px] text-neutral-500 dark:text-slate-500">
                        <time dateTime={row.occurredAt}>{new Date(row.occurredAt).toLocaleString()}</time>
                        {row.requestId ? <span className="font-mono"> · {row.requestId}</span> : null}
                      </span>
                    </span>
                    <span className={`${wideOnly} min-w-0`}>
                      <span className="block truncate text-xs text-neutral-800 dark:text-slate-200">
                        {row.service ?? (row.timedBy === 'client' ? 'browser' : '—')}
                      </span>
                      <span className="block truncate text-[11px] text-neutral-500 dark:text-slate-500">{row.environment ?? ''}</span>
                    </span>
                    <span>
                      <StatusBadge status={row.statusCode} />
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-neutral-800 dark:text-slate-200">{formatDuration(row.durationMs)}</span>
                    <span className={`${wideOnly} text-right font-mono text-xs tabular-nums text-neutral-600 dark:text-slate-400`}>
                      {formatBytes(row.responseSize)}
                    </span>
                    <span className={wideOnly}>
                      <CaptureBadge state={row.captureState} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && list.cursor ? (
          <div className="border-t border-neutral-200 px-3 py-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="text-xs font-medium text-neutral-700 hover:underline disabled:opacity-60 dark:text-slate-300"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </section>

      {filters.request ? (
        <RequestDrawer
          key={filters.request}
          requestId={filters.request}
          projectId={projectId}
          onClose={closeDrawer}
          onOpenRequest={openRequest}
        />
      ) : null}
    </div>
  );
}

function withCurrent(facets: Facet[], current: string): Facet[] {
  if (!current || facets.some((facet) => facet.value === current)) return facets;
  return [{ value: current, count: 0 }, ...facets];
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'bad' }) {
  return (
    <div className="bg-white px-4 py-3 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700 dark:text-red-300' : 'text-neutral-900 dark:text-white'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-3 py-6 text-xs text-neutral-500 dark:text-slate-400">
      {filtered ? (
        <p>No requests match these filters in this period.</p>
      ) : (
        <>
          <p className="font-medium text-neutral-800 dark:text-slate-200">No requests recorded in this period.</p>
          <p className="mt-1">
            Add <code className="font-mono">traceiq.middleware({'{ service: "api" }'})</code> to your Node server, or enable{' '}
            <code className="font-mono">autoCaptureRequests</code> in the browser SDK. Each request is recorded as a{' '}
            <code className="font-mono">$api_request</code> event.
          </p>
        </>
      )}
    </div>
  );
}

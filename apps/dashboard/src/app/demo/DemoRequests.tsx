'use client';

import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import { CAPTURE_LABELS, METHODS, STATUS_LABELS, formatBytes, formatDuration, statusTone } from '@/lib/requests';
import {
  DEFAULT_DEMO_REQUEST_FILTERS,
  DEMO_RANGES,
  buildRequests,
  filterRequests,
  summarizeRequests,
  type DemoRequest,
  type DemoRequestFilters
} from '@/lib/demo-data';
import { CaptureBadge, MethodBadge, StatusBadge, StatusPill } from '../dashboard/requests/RequestBadges';
import { CopyButton, JsonViewer } from '../dashboard/requests/JsonViewer';
import { useDemo, useDemoCompany } from './DemoContext';

const PAGE_SIZE = 40;

const selectClass =
  'h-8 rounded border border-neutral-200 bg-white px-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

const STATUS_FILTERS = [
  { value: '2xx', label: 'Success (2xx)' },
  { value: '4xx', label: 'Client errors (4xx)' },
  { value: '5xx', label: 'Server errors (5xx)' },
  { value: 'slow', label: 'Slow (over 1s)' }
];

export function DemoRequests({ initialRequestId }: { initialRequestId?: string }) {
  const company = useDemoCompany();
  const { range, now } = useDemo();
  const info = DEMO_RANGES.find((option) => option.value === range)!;
  const requests = useMemo(() => buildRequests(company, range, now), [company, range, now]);
  const services = useMemo(
    () => Array.from(new Set(requests.map((request) => request.service ?? 'browser'))).sort(),
    [requests]
  );

  const [filters, setFilters] = useState<DemoRequestFilters>(DEFAULT_DEMO_REQUEST_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => ({ ...current, search: searchDraft })), 200);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => setVisible(PAGE_SIZE), [filters, range]);

  const rows = useMemo(() => filterRequests(requests, filters), [requests, filters]);
  const summary = useMemo(() => summarizeRequests(rows), [rows]);
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const filterCount = [filters.search, filters.method, filters.status, filters.service].filter(Boolean).length;
  const update = (patch: Partial<DemoRequestFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const wideColumns = selected ? '' : 'md:grid-cols-[minmax(0,1fr)_140px_64px_84px_92px_120px]';
  const wideOnly = selected ? 'hidden' : 'hidden md:block';

  return (
    <div className={selected ? 'lg:pr-[min(44vw,760px)]' : undefined}>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
        Sampled HTTP requests from {company.name}&rsquo;s services over the last {info.long}. Filter them, then open one to see its
        headers, payloads, trace spans and logs.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search endpoint, service, request ID or trace ID"
          className="h-8 min-w-[220px] flex-1 rounded border border-neutral-200 bg-white px-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          aria-label="Search requests"
        />
        <select className={selectClass} value={filters.service} onChange={(e) => update({ service: e.target.value })} aria-label="Service">
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.method} onChange={(e) => update({ method: e.target.value })} aria-label="Method">
          <option value="">All methods</option>
          {METHODS.slice(0, 5).map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value === 'duration' ? 'duration' : 'time' })}
          aria-label="Sort"
        >
          <option value="time">Newest first</option>
          <option value="duration">Slowest first</option>
        </select>
        {filterCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearchDraft('');
              setFilters({ ...DEFAULT_DEMO_REQUEST_FILTERS, sort: filters.sort });
            }}
            className="h-8 px-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
          >
            Clear {filterCount} filter{filterCount === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>

      <section className="mb-4 grid grid-cols-2 gap-px border border-neutral-200 bg-neutral-200 dark:border-slate-800 dark:bg-slate-800 xl:grid-cols-4" aria-label="Summary">
        <Metric label="Requests" value={summary.total.toLocaleString()} hint={filterCount > 0 ? 'matching filters' : `sampled, last ${range}`} />
        <Metric
          label="Error rate"
          value={`${summary.errorRate}%`}
          hint={`${summary.serverErrors.toLocaleString()} server errors (5xx)`}
          tone={summary.serverErrors > 0 ? 'bad' : undefined}
        />
        <Metric label="P95 latency" value={summary.total > 0 ? formatDuration(summary.p95) : '—'} hint="95% of requests were faster" />
        <Metric
          label="Payload captures"
          value={(summary.captures.captured + summary.captures.redacted).toLocaleString()}
          hint={`${summary.captures.redacted.toLocaleString()} redacted · ${(summary.captures.metadataOnly + summary.captures.unavailable).toLocaleString()} metadata only`}
        />
      </section>

      <section className="border border-neutral-200 dark:border-slate-800">
        <div
          className={`grid grid-cols-[minmax(0,1fr)_72px_80px] gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 ${wideColumns}`}
        >
          <span>Request</span>
          <span className={wideOnly}>Service</span>
          <span>Status</span>
          <span className="text-right">Duration</span>
          <span className={`${wideOnly} text-right`}>Transferred</span>
          <span className={wideOnly}>Capture</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-xs text-neutral-500 dark:text-slate-400">No requests match these filters in this period.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
            {rows.slice(0, visible).map((row) => {
              const isSelected = row.id === selectedId;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_72px_80px] items-center gap-3 px-3 py-2 text-left ${wideColumns} ${
                      isSelected
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
                        <span className="font-mono"> · {row.requestId}</span>
                      </span>
                    </span>
                    <span className={`${wideOnly} min-w-0`}>
                      <span className="block truncate text-xs text-neutral-800 dark:text-slate-200">{row.service ?? 'browser'}</span>
                      <span className="block truncate text-[11px] text-neutral-500 dark:text-slate-500">{row.environment}</span>
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

        {rows.length > visible ? (
          <div className="border-t border-neutral-200 px-3 py-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
              className="text-xs font-medium text-neutral-700 hover:underline dark:text-slate-300"
            >
              Load more ({(rows.length - visible).toLocaleString()} left)
            </button>
          </div>
        ) : null}
      </section>

      {selected ? <DemoRequestDrawer key={selected.id} request={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'bad' }) {
  return (
    <div className="bg-white px-4 py-3 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700 dark:text-red-300' : 'text-neutral-900 dark:text-white'}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-slate-500">{hint}</p>
    </div>
  );
}

type DrawerTab = 'overview' | 'payload' | 'trace' | 'logs';

function DemoRequestDrawer({ request, onClose }: { request: DemoRequest; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('overview');
  const tone = statusTone(request.statusCode);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: Array<{ value: DrawerTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'payload', label: 'Payload' },
    { value: 'trace', label: `Trace (${request.spans.length})` },
    { value: 'logs', label: `Logs (${request.logs.length})` }
  ];

  return (
    <aside
      className="fixed inset-0 z-50 flex flex-col border-l border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:left-auto lg:w-[min(44vw,760px)]"
      aria-label="Request details"
    >
      <div className="border-b border-neutral-200 px-5 pt-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MethodBadge method={request.method} />
              <h2 className="truncate font-mono text-sm font-semibold text-neutral-900 dark:text-white">{request.route}</h2>
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-neutral-500 dark:text-slate-400">{request.url}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close request details"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <StatusPill tone={tone} label={`${request.statusCode} ${STATUS_LABELS[tone]}`} />
          <span className="rounded-full border border-neutral-200 px-2.5 py-0.5 font-mono text-neutral-700 dark:border-slate-700 dark:text-slate-300">
            {formatDuration(request.durationMs)}
          </span>
          <span className="text-neutral-500 dark:text-slate-400">{new Date(request.occurredAt).toLocaleString()}</span>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto" role="tablist">
          {tabs.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              onClick={() => setTab(option.value)}
              className={`shrink-0 border-b-2 pb-2.5 text-xs font-medium ${
                tab === option.value
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'overview' ? <OverviewTab request={request} /> : null}
        {tab === 'payload' ? <PayloadTab request={request} /> : null}
        {tab === 'trace' ? <TraceTab request={request} /> : null}
        {tab === 'logs' ? <LogsTab request={request} /> : null}
      </div>
    </aside>
  );
}

function OverviewTab({ request }: { request: DemoRequest }) {
  const fields: Array<[string, string | null, boolean?]> = [
    ['Service', request.service ?? 'browser'],
    ['Environment', request.environment],
    ['Timed by', request.timedBy === 'client' ? 'Browser round trip' : 'Server handler'],
    ['Instrumentation', request.instrumentation, true],
    ['Request ID', request.requestId, true],
    ['Trace ID', request.traceId, true],
    ['User', request.userId ?? 'anonymous', true],
    ['Session', request.sessionId, true],
    ['Request size', formatBytes(request.requestSize)],
    ['Response size', formatBytes(request.responseSize)],
    ['Capture', CAPTURE_LABELS[request.captureState]]
  ];
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 text-xs dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2">
      {fields.map(([label, value, mono]) => (
        <div key={label} className="bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">{label}</dt>
          <dd className={`mt-0.5 flex items-center justify-between gap-2 text-neutral-900 dark:text-slate-100 ${mono ? 'font-mono' : ''}`}>
            <span className="truncate">{value ?? '—'}</span>
            {mono && value ? <CopyButton text={value} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PayloadTab({ request }: { request: DemoRequest }) {
  if (request.captureState === 'metadata_only' || request.captureState === 'unavailable') {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-xs text-neutral-500 dark:border-slate-700 dark:text-slate-400">
        Payload capture is off for this route, so only metadata was recorded. Turn it on per route in capture settings.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <PayloadSection title="Request headers" value={request.requestHeaders} />
      {request.requestBody ? <PayloadSection title="Request body" value={request.requestBody} /> : null}
      <PayloadSection title="Response headers" value={request.responseHeaders} />
      <PayloadSection title="Response body" value={request.responseBody} />
      {request.captureState === 'redacted' ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">Sensitive fields were redacted by the SDK before leaving the server.</p>
      ) : null}
    </div>
  );
}

function PayloadSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">{title}</h3>
        <CopyButton text={JSON.stringify(value, null, 2)} />
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs dark:border-slate-800 dark:bg-slate-900">
        <JsonViewer value={value} />
      </div>
    </section>
  );
}

function TraceTab({ request }: { request: DemoRequest }) {
  const total = Math.max(1, request.durationMs);
  return (
    <div>
      <p className="mb-3 text-xs text-neutral-500 dark:text-slate-400">
        Spans that share trace <span className="font-mono">{request.traceId?.slice(0, 12)}…</span>, laid out on the request&rsquo;s timeline.
      </p>
      <ul className="space-y-1.5">
        {request.spans.map((span) => (
          <li key={span.id} className="grid grid-cols-[minmax(0,180px)_1fr_64px] items-center gap-3 text-xs">
            <span className="truncate font-mono text-neutral-800 dark:text-slate-200" style={{ paddingLeft: span.depth * 12 }} title={span.name}>
              {span.name}
            </span>
            <span className="relative h-5 rounded bg-neutral-100 dark:bg-slate-900">
              <span
                className={`absolute inset-y-0.5 rounded-sm ${span.status === 'error' ? 'bg-red-500' : span.depth === 0 ? 'bg-blue-600' : 'bg-blue-400 dark:bg-blue-500/70'}`}
                style={{ left: `${(span.offsetMs / total) * 100}%`, width: `${Math.max(0.8, (span.durationMs / total) * 100)}%` }}
                title={`${span.service} · ${span.durationMs} ms`}
              />
            </span>
            <span className="text-right font-mono tabular-nums text-neutral-600 dark:text-slate-400">{formatDuration(span.durationMs)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LogsTab({ request }: { request: DemoRequest }) {
  const levelClass = {
    info: 'text-neutral-500 dark:text-slate-400',
    warn: 'text-amber-700 dark:text-amber-300',
    error: 'text-red-700 dark:text-red-300'
  };
  return (
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 font-mono text-xs dark:divide-slate-800 dark:border-slate-800">
      {request.logs.map((log, index) => (
        <li key={index} className="flex gap-3 px-3 py-2">
          <span className="w-14 shrink-0 tabular-nums text-neutral-400 dark:text-slate-500">+{log.offsetMs}ms</span>
          <span className={`w-10 shrink-0 uppercase ${levelClass[log.level]}`}>{log.level}</span>
          <span className="min-w-0 break-words text-neutral-800 dark:text-slate-200">{log.message}</span>
        </li>
      ))}
    </ul>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { clientFetch } from '@/lib/analytics-api';
import {
  CAPTURE_LABELS,
  type CapturedBody,
  type CapturedSide,
  type RelatedResponse,
  type RequestDetail,
  type TimelineEntry,
  errorIssueHref,
  formatBytes,
  formatDuration,
  logsSearchHref
} from '@/lib/requests';
import { CaptureBadge, MethodBadge, StatusBadge } from './RequestBadges';
import { CopyButton, JsonViewer } from './JsonViewer';

type Tab = 'request' | 'response' | 'timeline' | 'context' | 'related';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'request', label: 'Request' },
  { key: 'response', label: 'Response' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'context', label: 'Context' },
  { key: 'related', label: 'Related' }
];

interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const idle = { data: null, error: null, loading: false };

function useResource<T>(path: string | null) {
  const [state, setState] = useState<Loadable<T>>(idle);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) {
      setState(idle);
      return;
    }
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    void clientFetch<T>(path, { signal: controller.signal }).then(({ data, error }) => {
      if (controller.signal.aborted) return;
      setState({ data, error, loading: false });
    });
    return () => controller.abort();
  }, [path, nonce]);
  return { ...state, retry: useCallback(() => setNonce((n) => n + 1), []) };
}

export function RequestDrawer({
  requestId,
  projectId,
  onClose
}: {
  requestId: string;
  projectId?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('request');
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const base = `/v1/dashboard/requests/${encodeURIComponent(requestId)}`;
  const detail = useResource<{ request: RequestDetail }>(`${base}${query}`);
  const timeline = useResource<{ instrumented: boolean; entries: TimelineEntry[] }>(
    tab === 'timeline' ? `${base}/timeline${query}` : null
  );
  const related = useResource<RelatedResponse>(tab === 'related' ? `${base}/related${query}` : null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const request = detail.data?.request ?? null;

  return (
    <aside
      className="fixed inset-0 z-40 flex flex-col border-l border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:left-auto lg:w-[min(44vw,860px)]"
      role="dialog"
      aria-label="Request details"
    >
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {request ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <MethodBadge method={request.method} />
                  <h2 className="truncate font-mono text-sm font-semibold text-neutral-900 dark:text-white" title={request.route}>
                    {request.route}
                  </h2>
                  <StatusBadge status={request.statusCode} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-slate-400">
                  <span className="tabular-nums">{new Date(request.occurredAt).toLocaleString()}</span>
                  <span className="tabular-nums font-medium text-neutral-800 dark:text-slate-200">{formatDuration(request.durationMs)}</span>
                  <span>
                    {request.service ?? <span className="italic">no service</span>}
                    {request.environment ? ` · ${request.environment}` : ''}
                  </span>
                  <CaptureBadge state={request.captureState} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-neutral-400 dark:text-slate-500">Request ID</span>
                  {request.requestId ? (
                    <>
                      <code className="truncate font-mono text-neutral-800 dark:text-slate-200">{request.requestId}</code>
                      <CopyButton text={request.requestId} />
                    </>
                  ) : (
                    <span className="text-neutral-400 dark:text-slate-500">not recorded</span>
                  )}
                </div>
              </>
            ) : (
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Request details</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close request details"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="flex border-b border-neutral-200 px-2 text-xs dark:border-slate-800" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              tab === item.key
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-4 text-xs">
        {detail.loading ? (
          <Muted>Loading request…</Muted>
        ) : detail.error || !request ? (
          <ErrorState message={detail.error ?? 'Request not found.'} onRetry={detail.retry} />
        ) : tab === 'request' ? (
          <RequestTab request={request} />
        ) : tab === 'response' ? (
          <ResponseTab request={request} />
        ) : tab === 'timeline' ? (
          <TimelineTab state={timeline} request={request} />
        ) : tab === 'context' ? (
          <ContextTab request={request} projectId={projectId} />
        ) : (
          <RelatedTab state={related} request={request} projectId={projectId} />
        )}
      </div>
    </aside>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-slate-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-neutral-500 dark:text-slate-400">{children}</p>;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      {children}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="font-semibold underline-offset-2 hover:underline">
        Retry
      </button>
    </div>
  );
}

function Fields({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[150px_1fr] gap-3 px-3 py-1.5">
          <dt className="text-neutral-500 dark:text-slate-400">{label}</dt>
          <dd className="min-w-0 break-all font-mono text-neutral-900 dark:text-slate-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function KeyValueTable({ values }: { values: Record<string, string | string[]> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return <Muted>None recorded.</Muted>;
  return (
    <Fields
      rows={entries.map(([key, value]) => [
        key,
        <span key={key} className={value === '[REDACTED]' ? 'text-amber-700 dark:text-amber-300' : undefined}>
          {Array.isArray(value) ? value.join(', ') : value}
        </span>
      ])}
    />
  );
}

function noPayloadExplanation(request: RequestDetail): string {
  if (request.captureState === 'unavailable') {
    return request.captureReason ?? 'The SDK reported that this payload could not be captured.';
  }
  return (
    request.captureReason ??
    'This request was recorded as metadata only. Enable payload capture in the SDK and in this project’s capture settings to record headers and bodies.'
  );
}

function BodyView({ body }: { body: CapturedBody }) {
  const text = body.encoding === 'json' ? JSON.stringify(body.value, null, 2) : String(body.value ?? '');
  switch (body.state) {
    case 'not_captured':
    case 'unavailable':
      return <Notice>{body.reason ?? 'Body was not captured.'}</Notice>;
    case 'empty':
      return <Muted>Empty body.</Muted>;
    default:
      return (
        <div className="space-y-1.5">
          {body.state === 'truncated' || body.state === 'redacted' ? (
            <p className={body.state === 'redacted' ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-500 dark:text-slate-400'}>
              {body.state === 'redacted' ? 'Sensitive fields were redacted before storage.' : body.reason}
            </p>
          ) : null}
          {body.encoding === 'json' ? (
            <JsonViewer value={body.value} />
          ) : (
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded border border-neutral-200 bg-neutral-50 p-2.5 font-mono text-[11.5px] leading-5 text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {text}
            </pre>
          )}
        </div>
      );
  }
}

function PayloadSide({ side, request, kind }: { side: CapturedSide | null; request: RequestDetail; kind: 'request' | 'response' }) {
  if (!side) {
    return (
      <Section title={kind === 'request' ? 'Headers, query & body' : 'Headers & body'}>
        <Notice>
          <span className="font-semibold">{CAPTURE_LABELS[request.captureState]}.</span> {noPayloadExplanation(request)}
        </Notice>
      </Section>
    );
  }
  const bodyText =
    side.body.value === undefined
      ? null
      : side.body.encoding === 'json'
        ? JSON.stringify(side.body.value, null, 2)
        : String(side.body.value);
  return (
    <>
      {kind === 'request' ? (
        <Section title="Query parameters">
          {side.query ? <KeyValueTable values={side.query} /> : <Muted>None recorded.</Muted>}
        </Section>
      ) : null}
      <Section title="Headers">
        {side.headersState === 'not_captured' ? (
          <Notice>Header capture is disabled in this project’s capture settings.</Notice>
        ) : side.headers ? (
          <KeyValueTable values={side.headers} />
        ) : (
          <Muted>None recorded.</Muted>
        )}
      </Section>
      <Section title="Body" aside={bodyText ? <CopyButton text={bodyText} /> : null}>
        <BodyView body={side.body} />
      </Section>
    </>
  );
}

function RequestTab({ request }: { request: RequestDetail }) {
  const side = request.payload?.request ?? null;
  return (
    <>
      <Section title="Overview">
        <Fields
          rows={[
            ['Route', request.route],
            ['URL', request.url ?? <Muted>not recorded</Muted>],
            ['Method', request.method],
            ['Content type', side?.body.contentType ?? <Muted>not recorded</Muted>],
            ['Request size', formatBytes(request.requestSize ?? side?.body.size ?? null)]
          ]}
        />
      </Section>
      <PayloadSide side={side} request={request} kind="request" />
    </>
  );
}

function ResponseTab({ request }: { request: RequestDetail }) {
  const side = request.payload?.response ?? null;
  return (
    <>
      <Section title="Overview">
        <Fields
          rows={[
            ['Status', <StatusBadge key="s" status={request.statusCode} />],
            ['Duration', formatDuration(request.durationMs)],
            ['Content type', side?.body.contentType ?? <Muted>not recorded</Muted>],
            ['Response size', formatBytes(request.responseSize ?? side?.body.size ?? null)]
          ]}
        />
      </Section>
      <PayloadSide side={side} request={request} kind="response" />
    </>
  );
}

function TimelineTab({
  state,
  request
}: {
  state: Loadable<{ instrumented: boolean; entries: TimelineEntry[] }> & { retry: () => void };
  request: RequestDetail;
}) {
  if (state.loading) return <Muted>Loading timeline…</Muted>;
  if (state.error) return <ErrorState message={state.error} onRetry={state.retry} />;
  const entries = state.data?.entries ?? [];
  if (!state.data?.instrumented) {
    return (
      <Notice>
        <p className="font-semibold">No recorded operations for this request.</p>
        <p className="mt-1">
          {request.traceId || request.requestId
            ? 'Nothing else was recorded with this request’s trace or request ID. Send structured logs (POST /v1/logs) with the same requestId or traceId to see them here.'
            : 'This request has no request or trace ID, so nothing can be correlated with it. Use the TraceIQ Node middleware (or send requestId/traceId on $api_request) to enable timelines.'}
        </p>
      </Notice>
    );
  }
  const span = Math.max(
    1,
    ...entries.map((entry) => entry.offsetMs + (entry.durationMs ?? 0))
  );
  return (
    <Section title={`${entries.length} recorded operations`}>
      <div className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
        {entries.map((entry) => {
          const left = (entry.offsetMs / span) * 100;
          const width = Math.max(((entry.durationMs ?? 0) / span) * 100, 0.6);
          const bar =
            entry.status === 'error' ? 'bg-red-500' : entry.status === 'warning' ? 'bg-amber-500' : 'bg-neutral-400 dark:bg-slate-500';
          return (
            <div key={`${entry.kind}:${entry.id}`} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-2 ${entry.current ? 'bg-neutral-50 dark:bg-slate-900' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-neutral-200 px-1 font-mono text-[10px] uppercase text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                    {entry.kind === 'log' ? 'log' : 'http'}
                  </span>
                  <span className="truncate font-mono text-neutral-900 dark:text-slate-100" title={entry.name}>
                    {entry.name}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-slate-400">
                  {entry.service ?? 'unknown service'} · +{formatDuration(entry.offsetMs)} ·{' '}
                  {entry.durationMs === null ? 'no duration' : formatDuration(entry.durationMs)}
                  {entry.statusCode ? ` · ${entry.statusCode}` : ''}
                  {entry.current ? ' · this request' : ` · matched by ${entry.matchedBy.replace('_', ' ')}`}
                </div>
              </div>
              <div className="relative h-full min-h-[18px]">
                <div className="absolute inset-y-[7px] left-0 right-0 bg-neutral-100 dark:bg-slate-800" />
                <div className={`absolute inset-y-[5px] ${bar}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500 dark:text-slate-400">
        Offsets come from recorded timestamps. Only records that share this request’s request ID or trace ID are shown.
      </p>
    </Section>
  );
}

function ContextTab({ request, projectId }: { request: RequestDetail; projectId?: string | null }) {
  const project = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const rows: Array<[string, ReactNode]> = [
    ['Project', request.projectId],
    ['Service', request.service],
    ['Environment', request.environment],
    ['Instrumentation', request.instrumentation],
    ['Request ID', request.requestId],
    ['Trace ID', request.traceId],
    ['Span ID', request.spanId],
    ['Parent span ID', request.parentSpanId],
    [
      'Session',
      request.sessionId ? (
        <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/dashboard/replays?sessionId=${encodeURIComponent(request.sessionId)}${project ? `&${project.slice(1)}` : ''}`}>
          {request.sessionId}
        </Link>
      ) : null
    ],
    [
      'User',
      request.userId ? (
        <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/dashboard/users/${encodeURIComponent(request.userId)}${project}`}>
          {request.userId}
        </Link>
      ) : null
    ],
    ['Anonymous ID', request.anonymousId],
    ['Host', request.host],
    ['Occurred at', new Date(request.occurredAt).toISOString()],
    ['Received at', request.receivedAt ? new Date(request.receivedAt).toISOString() : null],
    ['Record ID', request.id]
  ];
  const present = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  const missing = rows.filter(([, value]) => value === null || value === undefined || value === '').map(([label]) => label);
  return (
    <>
      <Section title="Recorded context">
        <Fields rows={present} />
      </Section>
      {missing.length > 0 ? (
        <p className="text-[11px] text-neutral-500 dark:text-slate-400">Not recorded for this request: {missing.join(', ')}.</p>
      ) : null}
    </>
  );
}

function RelatedTab({
  state,
  request,
  projectId
}: {
  state: Loadable<RelatedResponse> & { retry: () => void };
  request: RequestDetail;
  projectId?: string | null;
}) {
  if (state.loading) return <Muted>Loading related records…</Muted>;
  if (state.error) return <ErrorState message={state.error} onRetry={state.retry} />;
  const data = state.data;
  if (!data) return null;
  const correlationId = request.requestId ?? request.traceId;
  const project = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  const sessionSection = (
    <Section title="Session & user">
      {data.session || data.user ? (
        <div className="flex flex-wrap gap-3">
          {data.session ? (
            <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/dashboard/replays?sessionId=${encodeURIComponent(data.session.id)}${project ? `&${project.slice(1)}` : ''}`}>
              Session replays
            </Link>
          ) : null}
          {data.user ? (
            <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/dashboard/users/${encodeURIComponent(data.user.id)}${project}`}>
              User profile & events
            </Link>
          ) : null}
        </div>
      ) : (
        <Muted>No session or identified user was attached to this request.</Muted>
      )}
    </Section>
  );

  if (!correlationId) {
    return (
      <>
        <div className="mb-5">
          <Notice>
            This request has no request or trace ID, so it cannot be linked to logs, errors or monitor runs. Related records are
            never guessed from timestamps.
          </Notice>
        </div>
        {sessionSection}
      </>
    );
  }

  return (
    <>
      <Section
        title={`Logs (${data.logs.length})`}
        aside={
          <Link className="text-[11px] text-blue-700 hover:underline dark:text-blue-300" href={logsSearchHref(correlationId, request.occurredAt, projectId)}>
            Open in Logs
          </Link>
        }
      >
        {data.logs.length === 0 ? (
          <Muted>No structured logs carry this request’s IDs.</Muted>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
            {data.logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="mr-2 font-mono uppercase text-neutral-500 dark:text-slate-400">{log.level}</span>
                  {log.message}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400 dark:text-slate-500">
                  {new Date(log.timestamp).toLocaleTimeString()} · {log.matchedBy.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Errors (${data.errors.length})`}>
        {data.errors.length === 0 ? (
          <Muted>No exceptions were captured with this request’s IDs.</Muted>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
            {data.errors.map((error) => (
              <li key={error.id} className="px-3 py-1.5">
                <Link className="font-medium text-red-700 hover:underline dark:text-red-300" href={errorIssueHref(error.type, error.message, projectId)}>
                  {error.type}: {error.message}
                </Link>
                <span className="ml-2 text-[11px] text-neutral-400 dark:text-slate-500">{new Date(error.occurredAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Synthetic monitor runs (${data.syntheticRuns.length})`}>
        {data.syntheticRuns.length === 0 ? (
          <Muted>
            {request.requestId
              ? 'No monitor run recorded this request ID in its network log.'
              : 'Monitor runs link by request ID, which this request does not have.'}
          </Muted>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-slate-800 dark:border-slate-800">
            {data.syntheticRuns.map((run) => (
              <li key={run.id} className="flex items-center justify-between px-3 py-1.5">
                <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/dashboard/synthetic-monitors/${run.monitorId}/runs/${run.id}${project}`}>
                  {run.monitorName ?? run.monitorId}
                </Link>
                <span className="text-[11px] text-neutral-500 dark:text-slate-400">
                  {run.status} · {new Date(run.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {sessionSection}
    </>
  );
}

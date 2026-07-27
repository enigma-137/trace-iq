import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { MiniBars } from '@/components/charts/MiniBars';
import { RankedList } from '@/components/charts/RankedList';

export const dynamic = 'force-dynamic';

interface IssuesResponse {
  project: { id: string; name: string } | null;
  days: number;
  issues: Array<{
    type: string;
    message: string;
    occurrences: number;
    sessions: number;
    users: number;
    firstSeen: string;
    lastSeen: string;
    sparkline: number[];
  }>;
}

interface IssueDetailResponse {
  issue: { type: string; message: string };
  totals: { occurrences: number; sessions: number; users: number; firstSeen: string; lastSeen: string };
  browsers: Array<{ name: string; total: number }>;
  operatingSystems: Array<{ name: string; total: number }>;
  samples: Array<{
    id: string;
    message: string | null;
    stack: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    actor: string | null;
    externalId: string | null;
    occurredAt: string;
  }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ErrorsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/errors');
  const days = firstParam(searchParams.days) ?? '14';
  const selType = firstParam(searchParams.type);
  const selMessage = firstParam(searchParams.message);

  const { data, error } = await dashboardGet<IssuesResponse>(`/v1/dashboard/errors?days=${days}`, token);
  const issues = data?.issues ?? [];

  let detail: IssueDetailResponse | null = null;
  if (selType && selMessage) {
    const q = new URLSearchParams({ type: selType, message: selMessage, days });
    const result = await dashboardGet<IssueDetailResponse>(`/v1/dashboard/errors/issue?${q.toString()}`, token);
    detail = result.data;
  }

  return (
    <DashboardShell active="errors" title="Error tracking" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Issues</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Grouped <code className="font-mono">$exception</code> events from the SDK · last {days}d
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500 dark:text-slate-500">
            No errors captured. The SDK auto-captures uncaught exceptions, or call{' '}
            <code className="font-mono">traceiq.captureException(err)</code>.
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[180px_120px_90px_90px_90px_120px] gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 lg:grid">
              <span>Issue</span>
              <span>Volume</span>
              <span className="text-right">Events</span>
              <span className="text-right">Sessions</span>
              <span className="text-right">Users</span>
              <span className="text-right">Last seen</span>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-slate-800">
              {issues.map((issue) => {
                const active = issue.type === selType && issue.message === selMessage;
                const q = new URLSearchParams({ type: issue.type, message: issue.message, days });
                return (
                  <Link
                    key={`${issue.type}\n${issue.message}`}
                    href={`/dashboard/errors?${q.toString()}`}
                    className={`grid gap-3 px-5 py-3.5 transition lg:grid-cols-[180px_120px_90px_90px_90px_120px] lg:items-center lg:gap-4 ${
                      active ? 'bg-neutral-100 dark:bg-slate-900/60' : 'hover:bg-neutral-50 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{issue.type}</p>
                      <p className="truncate font-mono text-xs text-neutral-500 dark:text-slate-400">{issue.message}</p>
                    </div>
                    <div className="hidden lg:block">
                      <MiniBars values={issue.sparkline} />
                    </div>
                    <span className="text-sm tabular-nums text-neutral-700 dark:text-slate-300 lg:text-right">{issue.occurrences.toLocaleString()}</span>
                    <span className="hidden text-sm tabular-nums text-neutral-500 dark:text-slate-400 lg:block lg:text-right">{issue.sessions.toLocaleString()}</span>
                    <span className="hidden text-sm tabular-nums text-neutral-500 dark:text-slate-400 lg:block lg:text-right">{issue.users.toLocaleString()}</span>
                    <span className="hidden text-xs text-neutral-500 dark:text-slate-400 lg:block lg:text-right">{formatDate(issue.lastSeen)}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      {detail ? <IssueDetail detail={detail} /> : null}
    </DashboardShell>
  );
}

function IssueDetail({ detail }: { detail: IssueDetailResponse }) {
  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{detail.issue.type}</h3>
        <p className="mt-0.5 font-mono text-sm text-neutral-500 dark:text-slate-400">{detail.issue.message}</p>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <Stat label="Occurrences" value={detail.totals.occurrences} />
          <Stat label="Sessions" value={detail.totals.sessions} />
          <Stat label="Users" value={detail.totals.users} />
          <Stat label="First seen" value={formatDate(detail.totals.firstSeen)} />
          <Stat label="Last seen" value={formatDate(detail.totals.lastSeen)} />
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Browsers</p>
          <RankedList items={detail.browsers.map((b) => ({ label: b.name, total: b.total }))} />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">Operating systems</p>
          <RankedList items={detail.operatingSystems.map((o) => ({ label: o.name, total: o.total }))} />
        </div>
      </div>

      <div className="border-t border-neutral-200 p-5 dark:border-slate-800">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
          Recent occurrences
        </p>
        {detail.samples.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-slate-500">No samples.</p>
        ) : (
          <ul className="grid gap-3">
            {detail.samples.slice(0, 10).map((sample) => (
              <li key={sample.id} className="rounded-md border border-neutral-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-slate-400">
                  <span className="font-mono text-neutral-700 dark:text-slate-300">
                    {sample.externalId ?? sample.actor ?? 'anonymous'}
                  </span>
                  <span>
                    {[sample.browser, sample.os, sample.country].filter(Boolean).join(' · ')} · {formatDateTime(sample.occurredAt)}
                  </span>
                </div>
                {sample.stack ? (
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <code>{sample.stack}</code>
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-neutral-900 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

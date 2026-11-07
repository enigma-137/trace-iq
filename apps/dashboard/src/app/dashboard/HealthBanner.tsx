'use client';

import Link from 'next/link';
import { healthLogsHref, useProjectHealth } from '@/lib/health';

function withProject(path: string, projectId?: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (projectId) params.set('projectId', projectId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function clock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Banner at the top of the Overview when the last hour shows users hitting failures:
 * requests with no response, server errors, exceptions or failed actions. Renders
 * nothing while things are fine, so it only appears when there's something to act on.
 */
export function HealthBanner({ projectId }: { projectId?: string | null }) {
  const health = useProjectHealth(projectId);
  if (!health || (health.status !== 'outage' && health.status !== 'degraded')) return null;

  const outage = health.status === 'outage';
  const f = health.failures;
  const from = clock(f.firstAt);
  const to = clock(f.lastAt);
  const when = from && to ? (from === to ? `at ${from}` : `${from} – ${to}`) : null;

  const title = f.networkErrors > 0
    ? `${f.networkErrors} request${f.networkErrors === 1 ? '' : 's'} got no response. Your backend may be down or unreachable.`
    : outage
      ? 'Most requests are failing.'
      : 'Users are running into errors.';

  const details: string[] = [];
  if (f.topFailedRequest) {
    const status = f.topFailedRequest.status === 0 ? 'no response' : String(f.topFailedRequest.status);
    details.push(`Most affected: ${f.topFailedRequest.method} ${f.topFailedRequest.path} (${status}, ${f.topFailedRequest.count}×)`);
  }
  if (f.topError) details.push(`Top error: ${f.topError.type}: ${f.topError.message}`);
  if (f.topFailedAction) details.push(`${f.topFailedAction.name} × ${f.topFailedAction.count}`);
  if (f.affectedUsers > 0) details.push(`${f.affectedUsers} user${f.affectedUsers === 1 ? '' : 's'} affected`);
  if (when) details.push(when);

  const tone = outage
    ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100'
    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100';
  const link = outage
    ? 'text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100'
    : 'text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100';

  return (
    <section role="alert" className={`flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          {outage ? 'Outage' : 'Degraded'} · last {health.windowMinutes >= 60 ? `${health.windowMinutes / 60}h` : `${health.windowMinutes}m`}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{title}</p>
        {details.length > 0 ? <p className="mt-0.5 break-words text-xs opacity-80">{details.join(' · ')}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-semibold">
        <Link href={healthLogsHref(projectId)} className={link}>
          Error logs
        </Link>
        <Link href={withProject('/dashboard/requests', projectId, { status: 'error', range: '1h' })} className={link}>
          Failed requests
        </Link>
        <Link href={withProject('/dashboard/errors', projectId)} className={link}>
          Errors
        </Link>
      </div>
    </section>
  );
}

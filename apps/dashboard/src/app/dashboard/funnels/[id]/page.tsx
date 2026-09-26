import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { formatCount } from '@/lib/metrics';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { FunnelEventFlow } from '@/components/charts/FunnelEventFlow';
import { FunnelAiSummary } from './FunnelAiSummary';
import { FunnelDebugPanel, type FunnelDebugData } from './FunnelDebugPanel';
import { AddCurrentViewToDashboardButton } from '@/components/dashboards/AddCurrentViewToDashboardButton';

export const dynamic = 'force-dynamic';

interface FunnelStep {
  order: number;
  eventName: string;
  label: string | null;
  count: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

interface FunnelResultsResponse {
  funnel: { id: string; name: string };
  days: number;
  steps: FunnelStep[];
}

interface StepUsersResponse {
  step: { index: number; eventName: string; label: string | null };
  status: 'reached' | 'dropped';
  total: number;
  users: Array<{
    actor: string;
    userId: string | null;
    externalId: string | null;
    anonymousId: string | null;
    identified: boolean;
    lastSeenAt: string | null;
    os: string | null;
    country: string | null;
  }>;
}

const RANGES = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' }
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FunnelResultsPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession(`/dashboard/funnels/${params.id}`);
  const days = firstParam(searchParams.days) ?? '30';
  const debugEnabled = firstParam(searchParams.debug) === '1';
  const stepParam = firstParam(searchParams.step);
  const statusParam = firstParam(searchParams.status) === 'dropped' ? 'dropped' : 'reached';

  const { data, error } = await dashboardGet<FunnelResultsResponse>(
    `/v1/dashboard/funnels/${params.id}/results?days=${encodeURIComponent(days)}`,
    token
  );

  let debugData: FunnelDebugData | null = null;
  if (debugEnabled) {
    const debugResult = await dashboardGet<FunnelDebugData>(
      `/v1/dashboard/funnels/${params.id}/debug?days=${encodeURIComponent(days)}`,
      token
    );
    debugData = debugResult.data;
  }

  let stepUsers: StepUsersResponse | null = null;
  if (stepParam !== undefined) {
    const usersQuery = new URLSearchParams({ step: stepParam, status: statusParam, days, limit: '100' });
    const result = await dashboardGet<StepUsersResponse>(
      `/v1/dashboard/funnels/${params.id}/users?${usersQuery.toString()}`,
      token
    );
    stepUsers = result.data;
  }

  const steps = data?.steps ?? [];
  const overall = steps.length > 0 ? steps[steps.length - 1].conversionFromStart : 0;
  const startCount = steps[0]?.count ?? 0;
  const endCount = steps.length > 0 ? steps[steps.length - 1].count : 0;
  const worstDrop = biggestDrop(steps);

  return (
    <DashboardShell active="funnels" title={data?.funnel.name ?? 'Funnel'} userEmail={user.email}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/dashboard/funnels" className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white">
          ← All funnels
        </Link>
        {data ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/funnels/${params.id}?days=${days}&debug=${debugEnabled ? '' : '1'}`}
              className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold transition ${
                debugEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Data check {debugEnabled ? 'on' : ''}
            </Link>
            <Link
              href={`/dashboard/funnels/${params.id}/edit`}
              className="inline-flex h-9 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit funnel
            </Link>
            <AddCurrentViewToDashboardButton
              title={`${data.funnel.name} Funnel`}
              type="funnel"
              chartType="funnel"
              query={{ funnelId: data.funnel.id, days }}
              dateConfig={{ days }}
              className="h-9"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      {data ? (
        <>
          <section className="mb-6 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-start">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
                Overall conversion
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900 dark:text-white">
                {(overall * 100).toFixed(1)}%
              </p>
              <p className="mt-1.5 text-sm text-neutral-500 dark:text-slate-400">
                {startCount === 0
                  ? `No one entered this funnel in the last ${days} days.`
                  : `${formatCount(endCount)} of ${formatCount(startCount)} ${
                      startCount === 1 ? 'person' : 'people'
                    } who started completed all ${data.steps.length} steps.`}
              </p>
              {worstDrop ? (
                <Link
                  href={`/dashboard/funnels/${params.id}?days=${days}&step=${worstDrop.index}&status=dropped`}
                  className="mt-2 inline-block text-sm text-neutral-600 underline-offset-2 hover:underline dark:text-slate-300"
                >
                  <span className="text-neutral-400 dark:text-slate-500">Biggest drop-off:</span> Step {worstDrop.index + 1} ·{' '}
                  {worstDrop.step.label ?? worstDrop.step.eventName} —{' '}
                  <span className="text-red-600 dark:text-red-400">
                    {formatPct(worstDrop.dropRate)} ({formatCount(worstDrop.dropCount)}{' '}
                    {worstDrop.dropCount === 1 ? 'person' : 'people'}) left here.
                  </span>
                </Link>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 p-1 dark:border-slate-800">
              {RANGES.map((range) => (
                <Link
                  key={range.value}
                  href={`/dashboard/funnels/${params.id}?days=${range.value}`}
                  className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                    days === range.value
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-neutral-500 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-neutral-900'
                  }`}
                >
                  {range.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <p className="mb-4 text-xs text-neutral-500 dark:text-slate-400">
              Tap a bar to see who reached that step, or a “dropped” count to see who fell off.
            </p>
            <FunnelChart
              steps={data.steps}
              drilldown={{
                funnelId: params.id,
                days,
                activeStep: stepParam !== undefined ? Number(stepParam) : undefined,
                activeStatus: statusParam
              }}
            />
          </section>

          <FunnelEventFlow steps={data.steps} funnelId={params.id} days={days} />

          <FunnelAiSummary funnelId={params.id} days={days} />

          {stepUsers ? <StepUsersPanel data={stepUsers} funnelId={params.id} days={days} /> : null}

          {debugData ? <FunnelDebugPanel data={debugData} /> : null}
        </>
      ) : null}
    </DashboardShell>
  );
}

function StepUsersPanel({ data, funnelId, days }: { data: StepUsersResponse; funnelId: string; days: string }) {
  const stepName = data.step.label ?? data.step.eventName;
  const title =
    data.status === 'dropped'
      ? `Dropped before “${stepName}”`
      : `Reached “${stepName}”`;

  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {data.total.toLocaleString()} {data.total === 1 ? 'user' : 'users'} · last {days}d
          </p>
        </div>
        <Link
          href={`/dashboard/funnels/${funnelId}?days=${days}`}
          className="text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
        >
          Clear ✕
        </Link>
      </div>

      {data.users.length === 0 ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-slate-500">No users in this set.</p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-slate-800">
          {data.users.map((person) => {
            const meta = [person.os, person.country].filter(Boolean).join(' · ');
            const displayName = person.externalId ?? person.anonymousId ?? person.actor;
            const row = (
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-neutral-900 [overflow-wrap:anywhere] dark:text-white">{displayName}</p>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">
                    {person.identified ? 'identified' : 'anonymous'}
                    {meta ? ` · ${meta}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-500 dark:text-slate-400">{formatDate(person.lastSeenAt)}</span>
              </div>
            );
            const replayFilter = person.userId
              ? `userId=${encodeURIComponent(person.userId)}`
              : `anonymousId=${encodeURIComponent(person.anonymousId ?? person.actor)}`;
            return (
              <div key={person.actor} className="flex items-center transition hover:bg-neutral-50 dark:hover:bg-slate-900/40">
                {person.identified && person.userId ? <Link href={`/dashboard/users/${person.userId}`} className="min-w-0 flex-1">{row}</Link> : <div className="min-w-0 flex-1">{row}</div>}
                <Link href={`/dashboard/replays?${replayFilter}`} className="mr-5 shrink-0 text-xs font-semibold text-blue-600 hover:underline">Watch related replays</Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

// The step (after the first) that loses the most people in absolute terms — the leak to fix first.
function biggestDrop(
  steps: FunnelStep[]
): { index: number; step: FunnelStep; dropCount: number; dropRate: number } | null {
  let worst: { index: number; step: FunnelStep; dropCount: number; dropRate: number } | null = null;
  for (let i = 1; i < steps.length; i += 1) {
    const dropCount = steps[i].droppedFromPrevious;
    if (dropCount <= 0) continue;
    if (!worst || dropCount > worst.dropCount) {
      worst = { index: i, step: steps[i], dropCount, dropRate: 1 - steps[i].conversionFromPrevious };
    }
  }
  return worst;
}

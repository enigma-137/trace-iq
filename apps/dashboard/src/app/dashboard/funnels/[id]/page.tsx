import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FunnelChart } from '@/components/charts/FunnelChart';

export const dynamic = 'force-dynamic';

interface FunnelResultsResponse {
  funnel: { id: string; name: string };
  days: number;
  steps: Array<{
    order: number;
    eventName: string;
    label: string | null;
    count: number;
    conversionFromStart: number;
    conversionFromPrevious: number;
    droppedFromPrevious: number;
  }>;
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
  const stepParam = firstParam(searchParams.step);
  const statusParam = firstParam(searchParams.status) === 'dropped' ? 'dropped' : 'reached';

  const { data, error } = await dashboardGet<FunnelResultsResponse>(
    `/v1/dashboard/funnels/${params.id}/results?days=${encodeURIComponent(days)}`,
    token
  );

  let stepUsers: StepUsersResponse | null = null;
  if (stepParam !== undefined) {
    const usersQuery = new URLSearchParams({ step: stepParam, status: statusParam, days, limit: '100' });
    const result = await dashboardGet<StepUsersResponse>(
      `/v1/dashboard/funnels/${params.id}/users?${usersQuery.toString()}`,
      token
    );
    stepUsers = result.data;
  }

  const overall = data && data.steps.length > 0 ? data.steps[data.steps.length - 1].conversionFromStart : 0;

  return (
    <DashboardShell active="funnels" title={data?.funnel.name ?? 'Funnel'} userEmail={user.email}>
      <div className="mb-4">
        <Link href="/dashboard/funnels" className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-white">
          ← All funnels
        </Link>
      </div>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </section>
      ) : null}

      {data ? (
        <>
          <section className="mb-6 flex flex-col justify-between gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Overall conversion
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900 dark:text-white">
                {(overall * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">across {data.steps.length} steps</p>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-1 dark:border-neutral-800">
              {RANGES.map((range) => (
                <Link
                  key={range.value}
                  href={`/dashboard/funnels/${params.id}?days=${range.value}`}
                  className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                    days === range.value
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                      : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'
                  }`}
                >
                  {range.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
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

          {stepUsers ? <StepUsersPanel data={stepUsers} funnelId={params.id} days={days} /> : null}
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
    <section className="mt-6 rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div>
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {data.total.toLocaleString()} {data.total === 1 ? 'user' : 'users'} · last {days}d
          </p>
        </div>
        <Link
          href={`/dashboard/funnels/${funnelId}?days=${days}`}
          className="text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          Clear ✕
        </Link>
      </div>

      {data.users.length === 0 ? (
        <p className="p-5 text-sm text-neutral-500 dark:text-neutral-500">No users in this set.</p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {data.users.map((person) => {
            const meta = [person.os, person.country].filter(Boolean).join(' · ');
            const displayName = person.externalId ?? person.anonymousId ?? person.actor;
            const row = (
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-neutral-900 [overflow-wrap:anywhere] dark:text-white">{displayName}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    {person.identified ? 'identified' : 'anonymous'}
                    {meta ? ` · ${meta}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{formatDate(person.lastSeenAt)}</span>
              </div>
            );
            return person.identified && person.userId ? (
              <Link key={person.actor} href={`/dashboard/users/${person.userId}`} className="block transition hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                {row}
              </Link>
            ) : (
              <div key={person.actor}>{row}</div>
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

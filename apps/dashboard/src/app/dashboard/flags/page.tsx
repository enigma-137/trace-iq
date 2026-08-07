import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { FlagManager } from './FlagManager';

export const dynamic = 'force-dynamic';

interface FlagsResponse {
  project: { id: string } | null;
  flags: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    enabled: boolean;
    rolloutPercentage: number;
    overrides: Record<string, boolean>;
    targeting: Array<{ property: string; operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number | boolean }>;    payload: unknown;
  }>;
}

export default async function FlagsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/flags');
  const { data, error } = await dashboardGet<FlagsResponse>('/v1/dashboard/flags', token);

  return (
    <DashboardShell active="flags" title="Feature flags" userEmail={user.email}>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
        Turn features on or off for a chosen slice of users without an app release. Rollout is deterministic and sticky —
        a user who&apos;s in stays in as you raise the percentage.
      </p>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <FlagManager flags={data?.flags ?? []} />
    </DashboardShell>
  );
}

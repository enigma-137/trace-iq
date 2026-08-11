import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { AchievementsBoard } from './AchievementsBoard';
import { AchievementView } from './types';

export const dynamic = 'force-dynamic';

interface AchievementsResponse {
  project: { id: string; name: string } | null;
  achievements: AchievementView[];
}

export default async function AchievementsPage() {
  const { user, token } = await requireDashboardSession('/dashboard/achievements');
  const { data, error } = await dashboardGet<AchievementsResponse>('/v1/dashboard/achievements', token);

  return (
    <DashboardShell active="achievements" title="Achievements" userEmail={user.email}>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
        Milestones your workspace earns as it tracks real usage — first events, volume, and growth. Progress updates live and
        unlocks are automatic.
      </p>

      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <AchievementsBoard achievements={data?.achievements ?? []} />
    </DashboardShell>
  );
}

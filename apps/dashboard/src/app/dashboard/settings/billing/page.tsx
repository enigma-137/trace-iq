import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';

export const dynamic = 'force-dynamic';

export default async function BillingSettingsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user } = await requireDashboardSession('/dashboard/settings/billing');
  const projectId = firstParam(searchParams.projectId);

  return (
    <DashboardShell active="settings" title="Billing" userEmail={user.email} projectId={projectId}>
      <SettingsTabs />
      <div className="mt-6 flex flex-col items-center justify-center gap-4 rounded-xl border border-neutral-200 p-10 text-center dark:border-slate-800">
        <img
          src="/brand/building.png"
          alt="Page under construction"
          className="mx-auto max-h-64 w-auto"
        />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Billing is coming soon</h2>
        <p className="max-w-md text-sm text-neutral-500 dark:text-slate-400">
          We’re still putting the finishing touches on billing. This page will be available shortly.
        </p>
      </div>
    </DashboardShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

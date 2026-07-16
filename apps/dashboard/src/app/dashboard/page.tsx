import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';
import { DashboardShell } from './DashboardShell';
import { SetupPanel } from './SetupPanel';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!hasSupabaseServerConfig()) {
    redirect('/auth/login?missingConfig=1');
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/dashboard');
  }

  return (
    <DashboardShell active="overview" title="Overview" userEmail={user.email}>
      <section
        className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:shadow-none xl:grid-cols-[minmax(0,1fr)_auto]"
        aria-labelledby="dashboard-title"
      >
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
            Event tracking setup
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Manage your project credentials, SDK snippet, and browser event installation.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric label="Events" value="Live" />
          <Metric label="SDK" value="Ready" />
          <Metric label="Keys" value="Hashed" />
        </div>
      </section>

      <SetupPanel />
    </DashboardShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-xs text-slate-500 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-100">{value}</p>
    </div>
  );
}

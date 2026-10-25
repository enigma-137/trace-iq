import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from './DashboardHeader';
import { DashboardPlanProvider } from './DashboardPlan';
import { AskTraceIQProvider } from '@/components/ai/AskTraceIQContext';
import { StepUpDialogHost } from './StepUpDialogHost';
import { AskTraceIQDrawer } from '@/components/ai/AskTraceIQDrawer';
import { FeatureSpotlightCard } from '@/components/FeatureSpotlightCard';
import { readActiveProjectCookie } from '@/lib/dashboard';
import { ActiveProjectFetch } from './ActiveProjectFetch';

export interface DashboardShellProps {
  active?: string;
  activeNavKey?: string;
  title?: string;
  organizationName?: string | null;
  projectName?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  alertsSummary?: { total: number; firing: number; healthy: number } | null;
  userEmail?: string | null;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  active,
  activeNavKey,
  title,
  organizationName,
  projectName,
  projectId: projectIdProp,
  organizationId,
  alertsSummary,
  userEmail,
  headerActions,
  children
}: DashboardShellProps) {
  // Pages that don't resolve a project themselves still keep the sidebar links
  // (and Ask TraceIQ) on the project the user switched to.
  const projectId = projectIdProp ?? readActiveProjectCookie();
  const effectiveActive = activeNavKey || active || 'overview';
  const localMode = process.env.NEXT_PUBLIC_AUTH_MODE === 'local';

  return (
    <DashboardPlanProvider projectId={projectId}>
      <AskTraceIQProvider projectId={projectId}>
        <ActiveProjectFetch />
        <main className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
          <div className="flex min-h-screen w-full">
            <Sidebar active={effectiveActive} userEmail={userEmail} projectId={projectId} organizationId={organizationId} />

            <section className="min-w-0 flex-1">
              <DashboardHeader
                active={effectiveActive}
                title={title}
                organizationName={organizationName}
                projectName={projectName}
                projectId={projectId}
                organizationId={organizationId}
                alertsSummary={alertsSummary}
                userEmail={userEmail}
                headerActions={headerActions}
              />

              <div className="px-5 py-6 md:px-8 xl:px-10 2xl:px-12">
                {localMode ? (
                  <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Local single-user mode · Authentication is disabled. Keep this instance bound to your own machine.
                  </div>
                ) : null}
                {children}
              </div>
            </section>
          </div>
          <AskTraceIQDrawer />
          <StepUpDialogHost />
          <FeatureSpotlightCard projectId={projectId ?? undefined} surface="dashboard-shell" />
        </main>
      </AskTraceIQProvider>
    </DashboardPlanProvider>
  );
}

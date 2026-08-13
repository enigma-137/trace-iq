import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { MfaStepUpProvider } from './MfaStepUp';

interface DashboardShellProps {
  active: string;
  title: string;
  userEmail?: string | null;
  projectId?: string | null;
  children: ReactNode;
}

export function DashboardShell({ active, title, userEmail, projectId, children }: DashboardShellProps) {
  return (
    <MfaStepUpProvider>
      <main className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen w-full">
          <Sidebar active={active} userEmail={userEmail} projectId={projectId} />

          <section className="min-w-0 flex-1">
            <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <img className="h-7 w-auto dark:hidden lg:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                  {/* <img className="hidden h-7 w-auto dark:block lg:hidden" src="/brand/logo-white-no-bg.png" alt="TraceIQ" /> */}
                  <div className="min-w-0">
                    {/* <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">
                    Dashboard
                  </p> */}
                    <h1 id="dashboard-title" className="mt-0.5 truncate text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                      {title}
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MobileNav active={active} projectId={projectId} userEmail={userEmail} />
                </div>
              </div>
            </header>

            <div className="px-5 py-6 md:px-8 xl:px-10 2xl:px-12">{children}</div>
          </section>
        </div>
      </main>
    </MfaStepUpProvider>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';
import { SetupPanel } from './SetupPanel';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';

export const dynamic = 'force-dynamic';

const navItems = [
  { label: 'Overview', href: '/dashboard', active: true },
  { label: 'Setup', href: '/dashboard' },
  { label: 'Events', href: '/sdk-demo' },
  { label: 'Users', href: '/dashboard' },
  { label: 'Funnels', href: '/dashboard' },
  { label: 'Docs', href: '/docs' }
];

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
    <main className="min-h-screen bg-white text-slate-950 dark:bg-black dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800/80 dark:bg-slate-950/70 lg:block">
          <Link className="flex items-center gap-3" href="/" aria-label="TraceIQ home">
            <img
              className="h-9 w-auto dark:hidden"
              src="/brand/logo-black-no-bg.png"
              alt="TraceIQ"
            />
            <img
              className="hidden h-9 w-auto dark:block"
              src="/brand/logo-white-no-bg.png"
              alt="TraceIQ"
            />
          </Link>

          <nav className="mt-8 grid gap-1" aria-label="Dashboard navigation">
            {navItems.map((item) => (
              <Link
                key={item.label}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  item.active
                    ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800/80 dark:bg-black/90 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  className="h-8 w-auto dark:hidden lg:hidden"
                  src="/brand/logo-black-no-bg.png"
                  alt="TraceIQ"
                />
                <img
                  className="hidden h-8 w-auto dark:block lg:hidden"
                  src="/brand/logo-white-no-bg.png"
                  alt="TraceIQ"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-500">Dashboard</p>
                  <h1 id="dashboard-title" className="mt-1 truncate text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                    Overview
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden min-w-0 text-right sm:block">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{user.email ?? 'Account'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">Owner workspace</p>
                </div>
                <ThemeToggle />
                <SignOutButton />
              </div>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden" aria-label="Mobile dashboard navigation">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                    item.active ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="px-5 py-6 md:px-8 xl:px-10 2xl:px-12">
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
          </div>
        </section>
      </div>
    </main>
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

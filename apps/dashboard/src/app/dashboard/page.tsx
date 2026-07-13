import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';
import { SetupPanel } from './SetupPanel';
import { SignOutButton } from './SignOutButton';

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
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950 sm:px-10 lg:px-16">
      <header className="flex items-start justify-between gap-6 max-md:flex-col">
        <div>
          <Link className="text-sm font-extrabold uppercase tracking-normal text-slate-950" href="/">
            TraceIQ
          </Link>
          <p className="mt-1 text-slate-600">Authenticated dashboard</p>
        </div>
        <SignOutButton />
      </header>

      <section className="max-w-5xl py-16 md:py-20" aria-labelledby="dashboard-title">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-normal text-slate-600">
          Supabase Auth connected
        </p>
        <h1
          id="dashboard-title"
          className="max-w-5xl text-5xl font-medium leading-none tracking-normal text-slate-950 md:text-7xl"
        >
          Welcome back{user.email ? `, ${user.email}` : ''}.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
          This page is protected by the Supabase session. Create your first organization and project, then
          install the SDK on a browser website.
        </p>
      </section>

      <SetupPanel />
    </main>
  );
}

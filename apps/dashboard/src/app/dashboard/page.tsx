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
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div>
          <Link className="dashboard-brand" href="/">
            TraceIQ
          </Link>
          <p>Authenticated dashboard</p>
        </div>
        <SignOutButton />
      </header>

      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <p className="dashboard-kicker">Supabase Auth connected</p>
        <h1 id="dashboard-title">Welcome back{user.email ? `, ${user.email}` : ''}.</h1>
        <p>
          This page is protected by the Supabase session. Create your first organization and project, then
          install the SDK on a browser website.
        </p>
      </section>

      <SetupPanel />
    </main>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';
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
          This page is protected by the Supabase session. Next we can create the organization and project
          setup flow, then bind event reads to membership.
        </p>
      </section>

      <section className="dashboard-grid" aria-label="Next setup steps">
        <article className="dashboard-card">
          <span>01</span>
          <h2>Create organization</h2>
          <p>Use this Supabase user ID as the first owner in `organization_members`.</p>
          <code>{user.id}</code>
        </article>
        <article className="dashboard-card">
          <span>02</span>
          <h2>Create project</h2>
          <p>Attach projects to organizations, then only show projects for member organizations.</p>
        </article>
        <article className="dashboard-card">
          <span>03</span>
          <h2>Manage write keys</h2>
          <p>Generate, revoke, and rotate project write keys while SDK ingestion stays write-key protected.</p>
        </article>
      </section>
    </main>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShell } from '../DashboardShell';
import { withProjectId } from '../nav';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { RequestsExplorer } from './RequestsExplorer';

export const dynamic = 'force-dynamic';

interface CaptureSettingsResponse {
  project: { id: string; name: string } | null;
  canEdit: boolean;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RequestsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/requests');
  const projectId = firstParam(searchParams.projectId);
  // Resolves (and authorizes) the active project; also tells us whether the
  // viewer may change payload capture settings.
  const { data, error } = await dashboardGet<CaptureSettingsResponse>(
    `/v1/dashboard/requests/capture-settings${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    token
  );

  if (!projectId && data?.project?.id) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      const first = firstParam(value);
      if (first) params.set(key, first);
    }
    params.set('projectId', data.project.id);
    redirect(`/dashboard/requests?${params.toString()}`);
  }

  const canonicalProjectId = data?.project?.id ?? projectId ?? null;

  return (
    <DashboardShell active="requests" title="Requests" userEmail={user.email} projectId={canonicalProjectId}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
          Individual HTTP requests recorded by the SDK middleware and browser autocapture. Open a request to inspect its metadata,
          permitted payloads, and correlated logs and errors.
        </p>
        <Link
          href={withProjectId('/dashboard/api-performance', canonicalProjectId)}
          className="text-xs font-semibold text-neutral-700 underline-offset-4 hover:underline dark:text-slate-300"
        >
          API performance overview →
        </Link>
      </div>

      {error ? (
        <section className="rounded border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : (
        <Suspense fallback={<p className="text-xs text-neutral-500 dark:text-slate-400">Loading requests…</p>}>
          <RequestsExplorer projectId={canonicalProjectId} canEditCapture={data?.canEdit ?? false} />
        </Suspense>
      )}
    </DashboardShell>
  );
}

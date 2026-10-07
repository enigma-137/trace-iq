import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { ReplayDeleteButton } from '../ReplayDeleteButton';
import { ReplayPlayer } from './ReplayPlayer';

export default async function ReplayPage({ params, searchParams }: { params: { id: string }; searchParams: { projectId?: string } }) {
  const { user } = await requireDashboardSession(`/dashboard/replays/${params.id}`);
  return (
    <DashboardShell active="replays" title="Replay Player" userEmail={user.email} projectId={searchParams.projectId}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <Link href={`/dashboard/replays${searchParams.projectId ? `?projectId=${encodeURIComponent(searchParams.projectId)}` : ''}`} className="text-sm font-semibold hover:underline">← All replays</Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/synthetic-monitors/new?replayId=${encodeURIComponent(params.id)}${searchParams.projectId ? `&projectId=${encodeURIComponent(searchParams.projectId)}` : ''}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Convert to Synthetic Monitor
          </Link>
          <ReplayDeleteButton
            replayId={params.id}
            projectId={searchParams.projectId}
            redirectTo={`/dashboard/replays${searchParams.projectId ? `?projectId=${encodeURIComponent(searchParams.projectId)}` : ''}`}
          />
        </div>
      </div>
      <ReplayPlayer replayId={params.id} projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

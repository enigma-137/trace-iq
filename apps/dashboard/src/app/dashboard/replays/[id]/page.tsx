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
        <ReplayDeleteButton
          replayId={params.id}
          projectId={searchParams.projectId}
          redirectTo={`/dashboard/replays${searchParams.projectId ? `?projectId=${encodeURIComponent(searchParams.projectId)}` : ''}`}
        />
      </div>
      <ReplayPlayer replayId={params.id} projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

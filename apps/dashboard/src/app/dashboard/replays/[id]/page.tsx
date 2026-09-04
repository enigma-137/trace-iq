import Link from 'next/link';
import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { ReplayPlayer } from './ReplayPlayer';

export default async function ReplayPage({ params, searchParams }: { params: { id: string }; searchParams: { projectId?: string } }) {
  const { user } = await requireDashboardSession(`/dashboard/replays/${params.id}`);
  return (
    <DashboardShell active="replays" title="Replay Player" userEmail={user.email} projectId={searchParams.projectId}>
      <Link href={`/dashboard/replays${searchParams.projectId ? `?projectId=${encodeURIComponent(searchParams.projectId)}` : ''}`} className="mb-4 inline-block text-sm font-semibold hover:underline">← All replays</Link>
      <ReplayPlayer replayId={params.id} projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

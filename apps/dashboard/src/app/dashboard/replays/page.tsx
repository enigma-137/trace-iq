import Link from 'next/link';
import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import type { ReplayListItem } from '@/features/replay/types';

export const dynamic = 'force-dynamic';

export default async function ReplaysPage({ searchParams }: {
  searchParams: { projectId?: string; sessionId?: string; userId?: string; anonymousId?: string };
}) {
  const { user, token } = await requireDashboardSession('/dashboard/replays');
  const query = new URLSearchParams();
  if (searchParams.projectId) query.set('projectId', searchParams.projectId);
  if (searchParams.sessionId) query.set('sessionId', searchParams.sessionId);
  if (searchParams.userId) query.set('userId', searchParams.userId);
  if (searchParams.anonymousId) query.set('anonymousId', searchParams.anonymousId);
  const { data, error } = await dashboardGet<{
    project: { id: string; organizationId: string }; replays: ReplayListItem[];
  }>(`/v1/dashboard/replays?${query}`, token);
  const project = data?.project;

  return (
    <DashboardShell active="replays" title="Session Replays" userEmail={user.email}
      projectId={project?.id ?? searchParams.projectId} organizationId={project?.organizationId}>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
            Inspect a session in context. Replay payloads are rrweb events, not video files, and expire on their own retention schedule.
          </p>
          {searchParams.sessionId ? <p className="mt-2 font-mono text-xs text-neutral-500">Session: {searchParams.sessionId}</p> : null}
        </div>
        <Link href={`/dashboard/settings/replay${project?.id ? `?projectId=${encodeURIComponent(project.id)}` : ''}`}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold hover:bg-neutral-50 dark:border-slate-700 dark:hover:bg-slate-900">
          Replay settings
        </Link>
      </div>
      {error ? <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/70">
              <tr><th className="px-4 py-3">Visitor</th><th>Entry page</th><th>Started</th><th>Duration</th><th>Device</th><th>Location</th><th>Size</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-900">
              {(data?.replays ?? []).map((replay) => (
                <tr key={replay.id}>
                  <td className="px-4 py-3"><p className="max-w-52 truncate font-semibold">{replay.identity}</p><p className="font-mono text-[10px] text-neutral-400">{replay.sessionId}</p></td>
                  <td className="max-w-60 truncate">{replay.entryPage ?? 'â€”'}</td>
                  <td>{formatDate(replay.startedAt)}</td><td>{formatDuration(replay.durationMs)}</td>
                  <td>{[replay.deviceType, replay.browser].filter(Boolean).join(' Â· ') || 'â€”'}</td><td>{replay.country ?? 'â€”'}</td>
                  <td>{formatBytes(replay.compressedSizeBytes)}</td>
                  <td className="px-4 text-right"><Link className="font-semibold text-blue-600 hover:underline" href={`/dashboard/replays/${encodeURIComponent(replay.id)}?projectId=${encodeURIComponent(project?.id ?? searchParams.projectId ?? '')}`}>Watch replay</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.replays?.length ? <p className="p-8 text-center text-sm text-neutral-500">No matching replays. Recording is disabled by default until configured.</p> : null}
      </section>
    </DashboardShell>
  );
}

const formatDuration = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1_000) % 60).padStart(2, '0')}`;
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1_048_576).toFixed(1)} MB`;
const formatDate = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

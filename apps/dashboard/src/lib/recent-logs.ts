// Query helper for the Overview's Recent logs panel (kept React-free for tests).

export type RecentLogsView = 'all' | 'problems';

export const RECENT_LOGS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Params for the existing Logs API: last 24h for the project, optionally errors & warnings only. */
export function logsWindowQuery(projectId: string | null | undefined, view: RecentLogsView, now: number): URLSearchParams {
  const params = new URLSearchParams({
    from: new Date(now - RECENT_LOGS_WINDOW_MS).toISOString(),
    to: new Date(now).toISOString()
  });
  if (projectId) params.set('projectId', projectId);
  if (view === 'problems') params.set('status', 'error,warning');
  return params;
}

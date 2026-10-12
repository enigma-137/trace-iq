/**
 * The project the user last switched to. The middleware stores it in a cookie
 * whenever a dashboard URL carries `?projectId=`, and every dashboard API call
 * forwards it as a header so pages that don't read `projectId` themselves still
 * show the selected project. The API treats it as a soft preference: an
 * explicit `projectId` always wins.
 */
export const ACTIVE_PROJECT_COOKIE = 'traceiq_active_project';
export const ACTIVE_PROJECT_HEADER = 'x-traceiq-project-id';

export function readActiveProjectIdFromDocument(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_PROJECT_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

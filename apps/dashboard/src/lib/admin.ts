import { requireDashboardSession, dashboardGet, apiBaseUrl } from '@/lib/dashboard';

export interface AdminOverview {
  organizations: number;
  projects: number;
  eventsTotal: number;
  events24h: number;
  activeOrgs24h: number;
  trackedUsers: number;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  projectCount: number;
  eventCount: number;
  createdAt: string;
}

export interface AdminProject {
  id: string;
  name: string;
  slug: string;
  organizationName: string;
  eventCount: number;
  lastEventAt: string | null;
  createdAt: string;
}

export interface AdminActivityItem {
  id: string;
  eventName: string;
  projectName: string;
  organizationName: string;
  occurredAt: string;
  path: string | null;
  country: string | null;
  device: string | null;
}

export interface AdminLogEntry {
  kind: 'alert' | 'digest' | 'achievement' | 'audit';
  summary: string;
  occurredAt: string;
}

export interface AdminTimelinePoint {
  day: string;
  total: number;
}

export interface AdminActivationWeek {
  /** Monday of the signup week, UTC (YYYY-MM-DD). */
  weekStart: string;
  signedUp: number;
  createdProject: number;
  sentEvent: number;
  eligibleForReturn: number;
  returned: number;
}

export interface AdminActivation {
  weeks: AdminActivationWeek[];
  totals: Omit<AdminActivationWeek, 'weekStart'>;
  medianHoursToFirstEvent: number | null;
  stalled: Array<{ id: string; name: string; createdAt: string; stage: 'no_project' | 'no_events' }>;
}

export interface AdminAccess {
  isAdmin: boolean;
  activation?: AdminActivation | null;
  overview?: AdminOverview;
  organizations?: AdminOrganization[];
  projects?: AdminProject[];
  logs?: AdminLogEntry[];
  timeline?: AdminTimelinePoint[];
}

/**
 * Verifies the operator is authenticated AND listed in platform_admins by
 * hitting the admin overview endpoint. Unauthenticated visitors are redirected
 * to login; authenticated non-admins get `isAdmin: false` so the /admin page can
 * render a clean denial screen (no hint that the console exists).
 */
export async function requireAdminAccess(nextPath = '/admin'): Promise<AdminAccess> {
  const { token } = await requireDashboardSession(nextPath);

  const [overview, organizations, projects, logs, timeline, activation] = await Promise.all([
    dashboardGet<AdminOverview>('/v1/admin/overview', token),
    dashboardGet<AdminOrganization[]>('/v1/admin/organizations', token),
    dashboardGet<AdminProject[]>('/v1/admin/projects', token),
    dashboardGet<AdminLogEntry[]>('/v1/admin/logs', token),
    dashboardGet<AdminTimelinePoint[]>('/v1/admin/timeline', token),
    // Newer than the other admin endpoints: an API that predates it just hides the section.
    dashboardGet<AdminActivation>('/v1/admin/activation', token)
  ]);

  if (!overview.data) {
    return { isAdmin: false };
  }

  return {
    isAdmin: true,
    overview: overview.data,
    organizations: organizations.data ?? [],
    projects: projects.data ?? [],
    logs: logs.data ?? [],
    timeline: timeline.data ?? [],
    activation: activation.data ?? null
  };
}

export { apiBaseUrl };
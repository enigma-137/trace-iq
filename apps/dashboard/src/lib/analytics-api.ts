import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type {
  SavedInsightView,
  CreateInsightPayload,
  UpdateInsightPayload,
  ExecuteInsightQueryPayload,
  DashboardView,
  DashboardWidgetView,
  CreateDashboardPayload,
  UpdateDashboardPayload,
  AddWidgetPayload,
  UpdateWidgetPayload,
  DashboardTemplateDefinition
} from '@/types/analytics';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getBrowserAuthToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return 'traceiq-local';
  }
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function clientFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  const token = await getBrowserAuthToken();
  if (!token) {
    return { data: null, error: 'Your session has expired. Please log in again.' };
  }

  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const errJson = await res.json();
        message = errJson.message || errJson.error || message;
      } catch {}
      return { data: null, error: message };
    }

    if (res.status === 204) {
      return { data: null, error: null };
    }

    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Network request failed.' };
  }
}

// ----------------- Insights API -----------------

export async function fetchInsights(params: {
  projectId?: string;
  search?: string;
  tab?: 'all' | 'mine' | 'pinned';
  type?: string;
  tag?: string;
}) {
  const q = new URLSearchParams();
  if (params.projectId) q.set('projectId', params.projectId);
  if (params.search) q.set('search', params.search);
  if (params.tab) q.set('tab', params.tab);
  if (params.type) q.set('type', params.type);
  if (params.tag) q.set('tag', params.tag);

  return clientFetch<{ insights: SavedInsightView[] }>(`/v1/dashboard/insights?${q.toString()}`);
}

export async function fetchInsight(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ insight: SavedInsightView }>(`/v1/dashboard/insights/${id}${q}`);
}

export async function createInsight(payload: CreateInsightPayload) {
  return clientFetch<{ insight: SavedInsightView }>(`/v1/dashboard/insights`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateInsight(id: string, payload: UpdateInsightPayload) {
  return clientFetch<{ insight: SavedInsightView }>(`/v1/dashboard/insights/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteInsight(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ success: boolean }>(`/v1/dashboard/insights/${id}${q}`, {
    method: 'DELETE'
  });
}

export async function duplicateInsight(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ insight: SavedInsightView }>(`/v1/dashboard/insights/${id}/duplicate${q}`, {
    method: 'POST'
  });
}

export async function executeInsightQuery(payload: ExecuteInsightQueryPayload) {
  return clientFetch<{ result: any }>(`/v1/dashboard/insights/query`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ----------------- Dashboards API -----------------

export async function fetchDashboards(params: {
  projectId?: string;
  search?: string;
  tab?: 'all' | 'mine' | 'shared' | 'pinned';
  tag?: string;
}) {
  const q = new URLSearchParams();
  if (params.projectId) q.set('projectId', params.projectId);
  if (params.search) q.set('search', params.search);
  if (params.tab) q.set('tab', params.tab);
  if (params.tag) q.set('tag', params.tag);

  return clientFetch<{ dashboards: DashboardView[] }>(`/v1/dashboard/dashboards?${q.toString()}`);
}

export async function fetchDashboard(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ dashboard: DashboardView }>(`/v1/dashboard/dashboards/${id}${q}`);
}

export async function createDashboard(payload: CreateDashboardPayload) {
  return clientFetch<{ dashboard: DashboardView }>(`/v1/dashboard/dashboards`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDashboard(id: string, payload: UpdateDashboardPayload) {
  return clientFetch<{ dashboard: DashboardView }>(`/v1/dashboard/dashboards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteDashboard(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ success: boolean }>(`/v1/dashboard/dashboards/${id}${q}`, {
    method: 'DELETE'
  });
}

export async function duplicateDashboard(id: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ dashboard: DashboardView }>(`/v1/dashboard/dashboards/${id}/duplicate${q}`, {
    method: 'POST'
  });
}

export async function addDashboardWidget(dashboardId: string, payload: AddWidgetPayload) {
  return clientFetch<{ widget: DashboardWidgetView }>(`/v1/dashboard/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDashboardWidget(dashboardId: string, widgetId: string, payload: UpdateWidgetPayload) {
  return clientFetch<{ widget: DashboardWidgetView }>(`/v1/dashboard/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function removeDashboardWidget(dashboardId: string, widgetId: string, projectId?: string) {
  const q = projectId ? `?projectId=${projectId}` : '';
  return clientFetch<{ success: boolean }>(`/v1/dashboard/dashboards/${dashboardId}/widgets/${widgetId}${q}`, {
    method: 'DELETE'
  });
}

export async function updateDashboardLayout(dashboardId: string, layout: any[], projectId?: string) {
  return clientFetch<{ success: boolean }>(`/v1/dashboard/dashboards/${dashboardId}/layout`, {
    method: 'PUT',
    body: JSON.stringify({ layout, projectId })
  });
}

export async function fetchDashboardTemplates() {
  return clientFetch<{ templates: DashboardTemplateDefinition[] }>(`/v1/dashboard/dashboards/templates`);
}

export async function instantiateDashboardTemplate(templateId: string, name?: string, projectId?: string) {
  return clientFetch<{ dashboard: DashboardView }>(`/v1/dashboard/dashboards/template`, {
    method: 'POST',
    body: JSON.stringify({ templateId, name, projectId })
  });
}

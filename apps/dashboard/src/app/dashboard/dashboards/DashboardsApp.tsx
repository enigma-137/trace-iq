'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { Checkbox } from '@traceiq/ui';
import {
  dashboardToUrl,
  dashboardSummary,
  RECOMMENDED_TEMPLATES,
  type DashboardDefinition,
  type DashboardTemplate,
  type DashboardView,
  type TrendDefinition
} from './types';
import { TrendChart } from '@/components/charts/TrendChart';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface TrendsPoint {
  bucket: string;
  total: number;
  value: number;
}
interface TrendsSeries {
  key: string;
  points: TrendsPoint[];
}
interface TrendsResponse {
  event: string;
  interval: 'hour' | 'day' | 'week';
  measure: string;
  property: string | null;
  breakdown: string | null;
  buckets: string[];
  series: TrendsSeries[];
  summary: { current: number; previous: number; days: number };
}

interface CompareState {
  id: string;
  name: string;
  loading: boolean;
  error: string | null;
  data: TrendsResponse | null;
}

interface PublicShare {
  id: string;
  permissions: string[];
  expiresAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
}

function isTrend(def: DashboardDefinition): def is Extract<DashboardDefinition, { source: 'trend' }> {
  return def.source === 'trend';
}

export function DashboardsApp({
  projectId,
  initialDashboards,
  userId,
  initialToken,
  initialError
}: {
  projectId?: string;
  initialDashboards: DashboardView[];
  userId: string;
  initialToken?: string;
  initialError?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [dashboards, setDashboards] = useState<DashboardView[]>(initialDashboards);
  const [busy, setBusy] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  // Search, Filter & View mode states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'mine' | 'shared'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEvent, setCreateEvent] = useState('$pageview');
  const [createMeasure, setCreateMeasure] = useState('count');
  const [createDays, setCreateDays] = useState('30');
  const [createInterval, setCreateInterval] = useState<'hour' | 'day' | 'week'>('day');
  const [createBreakdown, setCreateBreakdown] = useState('');
  const [createShared, setCreateShared] = useState(false);
  const [selectedTemplatePreset, setSelectedTemplatePreset] = useState<string | null>(null);

  // Edit & Delete states
  const [editing, setEditing] = useState<DashboardView | null>(null);
  const [editName, setEditName] = useState('');
  const [editShared, setEditShared] = useState(false);
  const [deleting, setDeleting] = useState<DashboardView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Compare states
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareStates, setCompareStates] = useState<CompareState[]>([]);
  const [error, setError] = useState<string | null>(initialError ?? null);

  // Sharing states
  const [sharing, setSharing] = useState<DashboardView | null>(null);
  const [shares, setShares] = useState<PublicShare[]>([]);
  const [sharePermissions, setSharePermissions] = useState<string[]>(['summary', 'chart']);
  const [shareExpiryDays, setShareExpiryDays] = useState('30');
  const [createdShareUrl, setCreatedShareUrl] = useState('');
  const [shareToRevoke, setShareToRevoke] = useState<PublicShare | null>(null);
  const [shareRevokeError, setShareRevokeError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const projectQuery = projectId ? `?projectId=${projectId}` : '';

  async function getToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      return null;
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  }

  async function refresh() {
    const response = await authFetch(`/v1/dashboard/dashboards${projectQuery}`, { method: 'GET' });
    if (response?.ok) {
      const data = (await response.json()) as { dashboards: DashboardView[] };
      setDashboards(data.dashboards);
    }
  }

  // Create Dashboard from template (one-click)
  async function createFromTemplate(template: DashboardTemplate) {
    if (creatingTemplateId || busy) return;
    setCreatingTemplateId(template.id);
    setError(null);
    try {
      const response = await authFetch(`/v1/dashboard/dashboards`, {
        method: 'POST',
        body: JSON.stringify({
          name: template.name,
          definition: template.definition,
          isShared: false,
          projectId
        })
      });
      if (!response?.ok) {
        throw new Error(response ? await readError(response) : 'Could not create dashboard.');
      }
      toast.success(`Dashboard "${template.name}" created successfully!`, { title: 'Dashboard created' });
      await refresh();
    } catch (caughtError) {
      const message = await readApiError(caughtError, `Failed to create ${template.name} dashboard.`);
      setError(message);
      toast.error(message, { title: 'Creation failed' });
    } finally {
      setCreatingTemplateId(null);
    }
  }

  // Open Create Modal with optional preset
  function openCreateModal(preset?: DashboardTemplate) {
    if (preset) {
      setSelectedTemplatePreset(preset.id);
      setCreateName(preset.name);
      setCreateEvent(preset.definition.event);
      setCreateMeasure(preset.definition.measure ?? 'count');
      setCreateDays(preset.definition.days ?? '30');
      setCreateInterval((preset.definition.interval as 'hour' | 'day' | 'week') ?? 'day');
      setCreateBreakdown(preset.definition.breakdown ?? '');
    } else {
      setSelectedTemplatePreset(null);
      setCreateName('');
      setCreateEvent('$pageview');
      setCreateMeasure('count');
      setCreateDays('30');
      setCreateInterval('day');
      setCreateBreakdown('');
    }
    setCreateShared(false);
    setError(null);
    setIsCreateOpen(true);
  }

  // Submit custom dashboard creation
  async function handleCreateSubmit() {
    const name = createName.trim() || 'Custom Dashboard';
    setBusy(true);
    setError(null);
    try {
      const definition: TrendDefinition = {
        source: 'trend',
        event: createEvent.trim() || '$pageview',
        measure: createMeasure,
        interval: createInterval,
        days: createDays
      };
      if (createBreakdown.trim()) {
        definition.breakdown = createBreakdown.trim();
      }

      const response = await authFetch(`/v1/dashboard/dashboards`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          definition,
          isShared: createShared,
          projectId
        })
      });

      if (!response?.ok) {
        throw new Error(response ? await readError(response) : 'Failed to create dashboard.');
      }

      toast.success(`Dashboard "${name}" created!`, { title: 'Dashboard created' });
      setIsCreateOpen(false);
      await refresh();
    } catch (caughtError) {
      const message = await readApiError(caughtError, 'Could not create dashboard.');
      setError(message);
      toast.error(message, { title: 'Creation failed' });
    } finally {
      setBusy(false);
    }
  }

  async function openShare(dashboard: DashboardView) {
    setSharing(dashboard);
    setCreatedShareUrl('');
    setError(null);
    const response = await authFetch(`/v1/dashboard/dashboards/${dashboard.id}/shares${projectQuery}`, { method: 'GET' });
    if (response?.ok) setShares(((await response.json()) as { shares: PublicShare[] }).shares);
  }

  async function createShare() {
    if (!sharing || sharePermissions.length === 0) return;
    setBusy(true);
    setError(null);
    const days = Number(shareExpiryDays);
    const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const response = await authFetch(`/v1/dashboard/dashboards/${sharing.id}/shares`, {
      method: 'POST',
      body: JSON.stringify({ projectId, permissions: sharePermissions, expiresAt })
    });
    setBusy(false);
    if (!response?.ok) {
      setError(await readError(response));
      return;
    }
    const created = (await response.json()) as PublicShare & { token: string };
    await openShare(sharing);
    setCreatedShareUrl(`${window.location.origin}/share/${created.token}`);
  }

  async function revokeShare() {
    if (!sharing || !shareToRevoke || busy) return;
    setBusy(true);
    setShareRevokeError(null);
    try {
      const response = await authFetch(`/v1/dashboard/dashboards/${sharing.id}/shares/${shareToRevoke.id}${projectQuery}`, {
        method: 'DELETE'
      });
      if (!response?.ok) {
        throw new Error(response ? await readError(response) : 'Your dashboard session expired. Sign in again.');
      }
      setShareToRevoke(null);
      toast.success('The public dashboard link was revoked.', { title: 'Public link revoked' });
      await openShare(sharing);
    } catch (caughtError) {
      const message = await readApiError(caughtError, 'Could not revoke the public dashboard link.');
      setError(message);
      setShareRevokeError(message);
      toast.error(message, { title: 'Link revocation failed' });
    } finally {
      setBusy(false);
    }
  }

  function openEdit(dashboard: DashboardView) {
    setEditing(dashboard);
    setEditName(dashboard.name);
    setEditShared(dashboard.isShared);
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);
    const name = editName.trim();
    if (!name) {
      setError('Give the dashboard a name.');
      return;
    }
    setBusy(true);
    const response = await authFetch(`/v1/dashboard/dashboards/${editing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, isShared: editShared })
    });
    setBusy(false);
    if (response?.ok) {
      setEditing(null);
      toast.success(`Dashboard updated`, { title: 'Saved' });
      await refresh();
    } else {
      setError(await readError(response));
    }
  }

  async function confirmDelete() {
    if (!deleting || isDeleting) return;
    setError(null);
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const response = await authFetch(`/v1/dashboard/dashboards/${deleting.id}${projectQuery}`, { method: 'DELETE' });
      if (!response?.ok) {
        throw new Error(response ? await readError(response) : 'Your dashboard session expired. Sign in again.');
      }
      setCompareIds((ids) => ids.filter((id) => id !== deleting.id));
      toast.success(`Dashboard "${deleting.name}" was deleted.`, { title: 'Dashboard deleted' });
      setDeleting(null);
      await refresh();
    } catch (caughtError) {
      const message = await readApiError(caughtError, 'Could not delete the dashboard.');
      setError(message);
      setDeleteError(message);
      toast.error(message, { title: 'Dashboard deletion failed' });
    } finally {
      setIsDeleting(false);
    }
  }

  // Filter & Search computation
  const filteredDashboards = useMemo(() => {
    return dashboards.filter((item) => {
      // Tab filter
      if (filterTab === 'mine' && item.ownerId !== userId) return false;
      if (filterTab === 'shared' && !item.isShared) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSummary = dashboardSummary(item.definition).toLowerCase().includes(q);
        if (!matchName && !matchSummary) return false;
      }

      return true;
    });
  }, [dashboards, filterTab, searchQuery, userId]);

  const mineCount = useMemo(() => dashboards.filter((d) => d.ownerId === userId).length, [dashboards, userId]);
  const sharedCount = useMemo(() => dashboards.filter((d) => d.isShared).length, [dashboards]);

  // ---- comparison ----
  const selectedDashboards = useMemo(
    () => dashboards.filter((dashboard) => compareIds.includes(dashboard.id)),
    [dashboards, compareIds]
  );

  async function fetchCompare() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const token = await getToken();
    if (!token) return;

    setCompareStates(
      selectedDashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name,
        loading: true,
        error: null,
        data: null
      }))
    );

    await Promise.all(
      selectedDashboards.map(async (dashboard, index) => {
        if (!isTrend(dashboard.definition)) {
          setCompareStates((current) =>
            current.map((state, i) => (i === index ? { ...state, loading: false, error: 'Unsupported view type.' } : state))
          );
          return;
        }
        const def = dashboard.definition;
        const params = new URLSearchParams({ event: def.event, measure: def.measure ?? 'count' });
        if (def.interval) params.set('interval', def.interval);
        if (def.from || def.to) {
          if (def.from) params.set('from', def.from);
          if (def.to) params.set('to', def.to);
        } else {
          params.set('days', def.days ?? '30');
        }
        if (def.property) params.set('property', def.property);
        if (def.breakdown) params.set('breakdown', def.breakdown);
        if (def.filters) params.set('filters', def.filters);
        const setForIndex = (patch: Partial<CompareState>) =>
          setCompareStates((current) => current.map((state, i) => (i === index ? { ...state, ...patch, loading: false } : state)));
        try {
          const response = await fetch(`${apiBaseUrl}/v1/dashboard/insights/trends?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
          });
          if (!response.ok) {
            setForIndex({ error: await readError(response) });
            return;
          }
          const data = (await response.json()) as TrendsResponse;
          setCompareStates((current) => current.map((state, i) => (i === index ? { ...state, data, loading: false } : state)));
        } catch (fetchError) {
          if ((fetchError as Error).name !== 'AbortError') {
            setForIndex({ error: 'Could not load comparison data.' });
          }
        }
      })
    );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectionKey = compareIds.sort().join(',');
  useEffect(() => {
    if (compareIds.length >= 2) {
      void fetchCompare();
    } else {
      abortRef.current?.abort();
      setCompareStates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, dashboards]);

  return (
    <div className="space-y-6">
      {/* Top Header & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-800 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
          </div>
          <div>
            {/* <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Dashboards</h2> */}
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400 sm:text-sm">
              Create custom dashboards to monitor application usage, retention, performance, and key metrics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link
            href="/docs"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10M6 10h10" />
            </svg>
            Documentation
          </Link>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M12 5v14" />
            </svg>
            Create a Dashboard
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Recommended Dashboard Templates */}
      <section className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/30">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Recommended Templates</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Start with preconfigured analytics views, or customize them to fit your workflow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 self-start sm:self-auto"
          >
            Explore all templates →
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {RECOMMENDED_TEMPLATES.map((tmpl) => {
            const isCreatingThis = creatingTemplateId === tmpl.id;
            return (
              <div
                key={tmpl.id}
                className="group relative flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-xs dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {tmpl.iconName === 'product' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                      )}
                      {tmpl.iconName === 'acquisition' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="12" cy="12" r="10" />
                          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                        </svg>
                      )}
                      {tmpl.iconName === 'retention' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m3 16 4 4 4-4" />
                          <path d="M7 20V4a2 2 0 0 1 2-2h10" />
                          <path d="m21 8-4-4-4 4" />
                          <path d="M17 4v16a2 2 0 0 1-2 2H5" />
                        </svg>
                      )}
                      {tmpl.iconName === 'errors' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      )}
                    </div>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                      {tmpl.badge}
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-white sm:text-sm">{tmpl.name}</h4>
                  <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-slate-400">{tmpl.description}</p>
                </div>

                <div className="mt-4 flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-slate-800/60">
                  <button
                    type="button"
                    disabled={Boolean(creatingTemplateId)}
                    onClick={() => void createFromTemplate(tmpl)}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-neutral-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                  >
                    {isCreatingThis ? (
                      'Creating…'
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M12 5v14" />
                        </svg>
                        Use template
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateModal(tmpl)}
                    title="Customize template parameters"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    aria-label={`Customize ${tmpl.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Workspace / Saved Dashboards Area */}
      {dashboards.length === 0 ? (
        /* Polished Empty State */
        <section className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-950 sm:p-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-700 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-white sm:text-lg">
            You don't have any dashboards yet
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-neutral-500 dark:text-slate-400 sm:text-sm sm:leading-6">
            Pick a recommended template above to set up a dashboard in seconds, or build your own custom query to monitor and compare key metrics side by side.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M12 5v14" />
              </svg>
              Create a Dashboard
            </button>
            <Link
              href="/dashboard/insights"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Explore Insights
            </Link>
          </div>
        </section>
      ) : (
        /* Saved Dashboards Explorer */
        <div className="space-y-4">
          {/* Search, Filter Tabs, and View Toggle Toolbar */}
          <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500"
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search dashboards by name or query…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-md border border-neutral-200 bg-neutral-50/50 pl-8 pr-8 text-xs text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:border-white"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  ×
                </button>
              ) : null}
            </div>

            {/* Filter Tabs & View Mode */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              <div className="flex items-center rounded-md border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition ${filterTab === 'all'
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  All ({dashboards.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('mine')}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition ${filterTab === 'mine'
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  Mine ({mineCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('shared')}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition ${filterTab === 'shared'
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  Shared ({sharedCount})
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-md border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  className={`rounded p-1 transition ${viewMode === 'grid'
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-400 hover:text-neutral-900 dark:text-slate-500 dark:hover:text-slate-200'
                    }`}
                  aria-label="Grid view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="List view"
                  className={`rounded p-1 transition ${viewMode === 'list'
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-neutral-400 hover:text-neutral-900 dark:text-slate-500 dark:hover:text-slate-200'
                    }`}
                  aria-label="List view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Comparison Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-900 dark:text-white">Compare views:</span>
              <span>
                {compareIds.length === 0
                  ? 'Check 2 or more dashboards below to view them side by side.'
                  : `${compareIds.length} selected for side-by-side comparison.`}
              </span>
            </div>
            {compareIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setCompareIds([])}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Clear selection
              </button>
            ) : null}
          </div>

          {/* Dashboards Display: Grid or List */}
          {filteredDashboards.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              No dashboards match your active filters or search query.
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterTab('all');
                }}
                className="ml-2 font-semibold text-blue-600 underline dark:text-blue-400"
              >
                Reset filters
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Card Grid View */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDashboards.map((dashboard) => {
                const mine = dashboard.ownerId === userId;
                const isCompared = compareIds.includes(dashboard.id);

                return (
                  <div
                    key={dashboard.id}
                    className={`flex flex-col justify-between rounded-xl border bg-white p-5 transition-all shadow-xs dark:bg-slate-950 ${isCompared
                      ? 'border-blue-500 ring-1 ring-blue-500/20 dark:border-blue-500'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700'
                      }`}
                  >
                    <div>
                      {/* Card Header: Compare checkbox & visibility tag */}
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isCompared}
                            onCheckedChange={() => toggleCompare(setCompareIds, dashboard.id)}
                            aria-label={`Compare ${dashboard.name}`}
                          />
                          <span className="text-[11px] text-neutral-400 dark:text-slate-500">Compare</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${mine
                            ? 'bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-300'
                            : 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-500'
                            }`}
                        >
                          {mine ? 'Mine' : 'Shared'}
                        </span>
                      </div>

                      {/* Dashboard Title & Query Summary */}
                      <Link
                        href={dashboardToUrl(dashboard.definition)}
                        className="group block"
                      >
                        <h4 className="text-sm font-bold text-neutral-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                          {dashboard.name}
                        </h4>
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-mono text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                          </svg>
                          <span className="truncate">{dashboardSummary(dashboard.definition)}</span>
                        </div>
                      </Link>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3.5 dark:border-slate-800/80">
                      <Link
                        href={dashboardToUrl(dashboard.definition)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-slate-300 dark:hover:text-white"
                      >
                        Open view
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </Link>

                      <div className="flex items-center gap-1">
                        {mine ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(dashboard)}
                              className={toolbarBtn}
                              title="Edit name & visibility"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void openShare(dashboard)}
                              className={toolbarBtn}
                              title="Public link"
                            >
                              Share
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting(dashboard);
                              }}
                              className={deleteBtn}
                              aria-label="Delete dashboard"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Tabular List View */
            <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
                {filteredDashboards.map((dashboard) => {
                  const mine = dashboard.ownerId === userId;
                  const isCompared = compareIds.includes(dashboard.id);

                  return (
                    <li
                      key={dashboard.id}
                      className={`flex flex-col gap-3 px-5 py-3.5 transition-colors sm:flex-row sm:items-center ${isCompared ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'hover:bg-neutral-50/60 dark:hover:bg-slate-900/40'
                        }`}
                    >
                      <Checkbox
                        checked={isCompared}
                        onCheckedChange={() => toggleCompare(setCompareIds, dashboard.id)}
                        aria-label={`Compare ${dashboard.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={dashboardToUrl(dashboard.definition)}
                            className="truncate text-sm font-semibold text-neutral-900 hover:underline dark:text-white"
                          >
                            {dashboard.name}
                          </Link>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${mine
                              ? 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300'
                              : 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-500'
                              }`}
                          >
                            {mine ? 'Mine' : 'Shared'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-mono text-neutral-500 dark:text-slate-400">
                          {dashboardSummary(dashboard.definition)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link className={toolbarBtn} href={dashboardToUrl(dashboard.definition)}>
                          Open
                        </Link>
                        {mine ? (
                          <>
                            <button className={toolbarBtn} onClick={() => openEdit(dashboard)}>
                              Edit
                            </button>
                            <button className={toolbarBtn} onClick={() => void openShare(dashboard)}>
                              Public link
                            </button>
                            <button
                              className={deleteBtn}
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting(dashboard);
                              }}
                              aria-label="Delete dashboard"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Side-by-Side Comparison Section */}
      {compareIds.length >= 2 ? (
        <section className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Side-by-Side Comparison
              </p>
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                Comparing {compareStates.length} dashboard queries concurrently
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              Close comparison
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {compareStates.map((state) => (
              <div
                key={state.id}
                className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{state.name}</p>
                  {state.data ? (
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-neutral-400 dark:text-slate-500">
                      {state.data.measure === 'sum' || state.data.measure === 'avg'
                        ? compact(state.data.summary.current)
                        : Math.round(state.data.summary.current).toLocaleString('en-US')}{' '}
                      · last {state.data.summary.days}d
                    </span>
                  ) : null}
                </div>
                {state.error ? (
                  <p className="px-2 py-6 text-sm text-neutral-500 dark:text-slate-500">{state.error}</p>
                ) : !state.data ? (
                  <p className="px-2 py-6 text-sm text-neutral-400 dark:text-slate-500">Preparing query data…</p>
                ) : (
                  <TrendChart
                    buckets={state.data.buckets}
                    series={state.data.series}
                    interval={state.data.interval}
                    format={state.data.measure === 'sum' || state.data.measure === 'avg' ? 'compact' : 'number'}
                    legendTotals={state.data.measure === 'count' || state.data.measure === 'sum'}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Create Dashboard Dialog */}
      <DashboardDialog
        open={isCreateOpen}
        title="Create a Dashboard"
        description="Set up a new saved analytics view to monitor trends and compare performance."
        onClose={() => {
          if (!busy) setIsCreateOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy}
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
              disabled={busy || !createName.trim()}
              onClick={() => void handleCreateSubmit()}
            >
              {busy ? 'Creating…' : 'Create Dashboard'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Preset Selector */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Starter Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RECOMMENDED_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplatePreset === tmpl.id;
                return (
                  <button
                    type="button"
                    key={tmpl.id}
                    onClick={() => {
                      setSelectedTemplatePreset(tmpl.id);
                      setCreateName(tmpl.name);
                      setCreateEvent(tmpl.definition.event);
                      setCreateMeasure(tmpl.definition.measure ?? 'count');
                      setCreateDays(tmpl.definition.days ?? '30');
                      setCreateInterval((tmpl.definition.interval as 'hour' | 'day' | 'week') ?? 'day');
                      setCreateBreakdown(tmpl.definition.breakdown ?? '');
                    }}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition ${isSelected
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-100'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'
                      }`}
                  >
                    <span className="text-xs font-semibold">{tmpl.name}</span>
                    <span className="mt-0.5 text-[10px] text-neutral-500 dark:text-slate-400">{tmpl.category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Dashboard Name
            </label>
            <input
              className={inputClass}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Product Overview"
            />
          </div>

          {/* Event and Measure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Event
              </label>
              <input
                className={inputClass}
                value={createEvent}
                onChange={(e) => setCreateEvent(e.target.value)}
                placeholder="$pageview, $identify…"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Measure
              </label>
              <select
                className={inputClass}
                value={createMeasure}
                onChange={(e) => setCreateMeasure(e.target.value)}
              >
                <option value="count">Count (Total events)</option>
                <option value="unique">Unique Users</option>
                <option value="avg">Average</option>
                <option value="sum">Sum</option>
              </select>
            </div>
          </div>

          {/* Time range & interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Time Range
              </label>
              <select
                className={inputClass}
                value={createDays}
                onChange={(e) => setCreateDays(e.target.value)}
              >
                <option value="1">Last 24 Hours</option>
                <option value="7">Last 7 Days</option>
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Interval
              </label>
              <select
                className={inputClass}
                value={createInterval}
                onChange={(e) => setCreateInterval(e.target.value as 'hour' | 'day' | 'week')}
              >
                <option value="hour">Hourly</option>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
              </select>
            </div>
          </div>

          {/* Breakdown */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
              Breakdown Property (Optional)
            </label>
            <input
              className={inputClass}
              value={createBreakdown}
              onChange={(e) => setCreateBreakdown(e.target.value)}
              placeholder="$browser, $initial_referrer, $current_url…"
            />
          </div>

          <div className="pt-1">
            <Checkbox checked={createShared} onCheckedChange={setCreateShared} label="Share with workspace members" />
          </div>

          <div className="border-t border-neutral-100 pt-3 text-right dark:border-slate-800">
            <Link
              href="/dashboard/insights"
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Or build visually in Insights →
            </Link>
          </div>
        </div>
      </DashboardDialog>

      {/* Public Share Dialog */}
      <DashboardDialog
        open={Boolean(sharing) && !shareToRevoke}
        title="Public dashboard link"
        description="Create revocable, read-only links with only the permissions selected below."
        onClose={() => {
          if (!busy) {
            setSharing(null);
            setCreatedShareUrl('');
          }
        }}
        footer={
          <>
            <button className={secondaryBtn} disabled={busy} onClick={() => setSharing(null)}>
              Close
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
              disabled={busy || sharePermissions.length === 0}
              onClick={() => void createShare()}
            >
              {busy ? 'Creating…' : 'Create link'}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Allowed sections</p>
            {([
              ['summary', 'Summary numbers'],
              ['chart', 'Chart and series'],
              ['definition', 'Saved filters and configuration']
            ] as const).map(([permission, label]) => (
              <Checkbox
                key={permission}
                checked={sharePermissions.includes(permission)}
                onCheckedChange={(checked) =>
                  setSharePermissions((current) =>
                    checked ? [...new Set([...current, permission])] : current.filter((item) => item !== permission)
                  )
                }
                label={label}
              />
            ))}
          </div>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Expires after
            <select className={inputClass} value={shareExpiryDays} onChange={(event) => setShareExpiryDays(event.target.value)}>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="">Never</option>
            </select>
          </label>
          {createdShareUrl ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Copy this link now—the secret is shown only once.
              </p>
              <div className="mt-2 flex gap-2">
                <input readOnly className={inputClass} value={createdShareUrl} />
                <button
                  className={toolbarBtn}
                  onClick={() => {
                    void navigator.clipboard.writeText(createdShareUrl);
                    toast.success('Link copied to clipboard');
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Active links</p>
            {shares.length === 0 ? (
              <p className="text-sm text-neutral-500">No active public links.</p>
            ) : (
              <div className="grid gap-2">
                {shares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3 text-xs dark:border-slate-700">
                    <div>
                      <p className="font-semibold">{share.permissions.join(', ')}</p>
                      <p className="mt-1 text-neutral-500">
                        {share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : 'Never expires'}
                        {share.lastAccessedAt ? ` · last opened ${new Date(share.lastAccessedAt).toLocaleString()}` : ' · never opened'}
                      </p>
                    </div>
                    <button
                      className={deleteBtn}
                      onClick={() => {
                        setShareRevokeError(null);
                        setShareToRevoke(share);
                      }}
                      aria-label="Revoke public link"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DashboardDialog>

      {/* Revoke Share Dialog */}
      <DashboardDialog
        open={Boolean(shareToRevoke)}
        title="Revoke public link?"
        description="Anyone using this link will immediately lose access to the shared dashboard."
        onClose={() => {
          if (!busy) setShareToRevoke(null);
        }}
        footer={
          <>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setShareToRevoke(null)}>
              Cancel
            </button>
            <button type="button" className={dangerBtn} disabled={busy} onClick={() => void revokeShare()}>
              {busy ? 'Revoking…' : 'Revoke link'}
            </button>
          </>
        }
      >
        {shareRevokeError ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            {shareRevokeError}
          </p>
        ) : null}
      </DashboardDialog>

      {/* Edit Dashboard Dialog */}
      <DashboardDialog
        open={Boolean(editing)}
        title="Edit dashboard"
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        footer={
          <>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
              disabled={busy}
              onClick={() => void saveEdit()}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
            Name
            <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Top users last 24h" />
          </label>
          <Checkbox checked={editShared} onCheckedChange={setEditShared} label="Share with workspace" />
        </div>
      </DashboardDialog>

      {/* Delete Dashboard Dialog */}
      <DashboardDialog
        open={Boolean(deleting)}
        title="Delete dashboard?"
        description="This permanently removes the saved view. No analytics data is affected."
        onClose={() => {
          if (!isDeleting) setDeleting(null);
        }}
        footer={
          <>
            <button type="button" className={secondaryBtn} disabled={isDeleting} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button type="button" className={dangerBtn} disabled={isDeleting} onClick={() => void confirmDelete()}>
              {isDeleting ? 'Deleting…' : 'Delete dashboard'}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            <span className="font-semibold text-neutral-900 dark:text-white">{deleting?.name}</span> will be removed.
          </p>
          {deleteError ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>
      </DashboardDialog>
    </div>
  );
}

function toggleCompare(setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) {
  setter((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

async function readError(response: Response | null): Promise<string> {
  if (!response) return 'Request failed.';
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

const inputClass =
  'min-h-8 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-white dark:focus:ring-white/10';
const toolbarBtn =
  'inline-flex h-7 items-center justify-center rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-semibold text-neutral-700 shadow-2xs transition hover:bg-neutral-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const deleteBtn =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 shadow-2xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';
const secondaryBtn =
  'h-9 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const dangerBtn =
  'h-9 rounded-lg bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60';

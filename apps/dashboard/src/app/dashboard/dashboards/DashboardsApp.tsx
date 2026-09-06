'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { Checkbox } from '@traceiq/ui';
import { dashboardToUrl, dashboardSummary, type DashboardDefinition, type DashboardView } from './types';
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

interface PublicShare { id: string; permissions: string[]; expiresAt: string | null; createdAt: string; lastAccessedAt: string | null }

function isTrend(def: DashboardDefinition): def is Extract<DashboardDefinition, { source: 'trend' }> {
  return def.source === 'trend';
}

export function DashboardsApp({
  projectId,
  initialDashboards,
  userId,
  initialToken
}: {
  projectId?: string;
  initialDashboards: DashboardView[];
  userId: string;
  initialToken?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [dashboards, setDashboards] = useState<DashboardView[]>(initialDashboards);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DashboardView | null>(null);
  const [editName, setEditName] = useState('');
  const [editShared, setEditShared] = useState(false);
  const [deleting, setDeleting] = useState<DashboardView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareStates, setCompareStates] = useState<CompareState[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  async function openShare(dashboard: DashboardView) {
    setSharing(dashboard); setCreatedShareUrl(''); setError(null);
    const response = await authFetch(`/v1/dashboard/dashboards/${dashboard.id}/shares${projectQuery}`, { method: 'GET' });
    if (response?.ok) setShares(((await response.json()) as { shares: PublicShare[] }).shares);
  }

  async function createShare() {
    if (!sharing || sharePermissions.length === 0) return;
    setBusy(true); setError(null);
    const days = Number(shareExpiryDays);
    const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const response = await authFetch(`/v1/dashboard/dashboards/${sharing.id}/shares`, {
      method: 'POST', body: JSON.stringify({ projectId, permissions: sharePermissions, expiresAt })
    });
    setBusy(false);
    if (!response?.ok) { setError(await readError(response)); return; }
    const created = await response.json() as PublicShare & { token: string };
    await openShare(sharing);
    setCreatedShareUrl(`${window.location.origin}/share/${created.token}`);
  }

  async function revokeShare() {
    if (!sharing || !shareToRevoke || busy) return;
    setBusy(true);
    setShareRevokeError(null);
    try {
      const response = await authFetch(`/v1/dashboard/dashboards/${sharing.id}/shares/${shareToRevoke.id}${projectQuery}`, { method: 'DELETE' });
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
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          {dashboards.length} saved dashboard{dashboards.length === 1 ? '' : 's'}
        </p>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          href="/dashboard/insights"
        >
          Build from Insights
        </Link>
      </div>

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </p>
      ) : null}

      {dashboards.length === 0 ? (
        <section className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          No saved dashboards yet. Head to <span className="font-medium text-neutral-700 dark:text-slate-200">Insights</span>,
          set up a view, and click <span className="font-mono text-neutral-700 dark:text-slate-200">Save view</span> to capture it.
        </section>
      ) : (
        <section className="overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-3 dark:border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
              Compare
            </span>
            <span className="text-xs text-neutral-400 dark:text-slate-500">
              Select two or more to view side by side · {compareIds.length} selected
            </span>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
            {dashboards.map((dashboard) => {
              const mine = dashboard.ownerId === userId;
              return (
                <li key={dashboard.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <Checkbox
                    checked={compareIds.includes(dashboard.id)}
                    onCheckedChange={() => toggleCompare(setCompareIds, dashboard.id)}
                    aria-label={`Compare ${dashboard.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{dashboard.name}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${mine
                            ? 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300'
                            : 'border border-neutral-200 text-neutral-400 dark:border-slate-800 dark:text-slate-500'
                          }`}
                      >
                        {mine ? 'Mine' : 'Shared'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500 dark:text-slate-400">
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

      {compareIds.length >= 2 ? (
        <section className="grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            Comparison
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {compareStates.map((state) => (
              <div
                key={state.id}
                className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
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
                  <p className="px-2 py-6 text-sm text-neutral-400 dark:text-slate-500">Preparing…</p>
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

      <DashboardDialog
        open={Boolean(sharing) && !shareToRevoke}
        title="Public dashboard link"
        description="Create revocable, read-only links with only the permissions selected below."
        onClose={() => { if (!busy) { setSharing(null); setCreatedShareUrl(''); } }}
        footer={<><button className={secondaryBtn} disabled={busy} onClick={() => setSharing(null)}>Close</button><button className={primaryBtn} disabled={busy || sharePermissions.length === 0} onClick={() => void createShare()}>{busy ? 'Creating…' : 'Create link'}</button></>}
      >
        <div className="grid gap-4">
          <div className="grid gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Allowed sections</p>
            {([['summary', 'Summary numbers'], ['chart', 'Chart and series'], ['definition', 'Saved filters and configuration']] as const).map(([permission, label]) => <Checkbox key={permission} checked={sharePermissions.includes(permission)} onCheckedChange={(checked) => setSharePermissions((current) => checked ? [...new Set([...current, permission])] : current.filter((item) => item !== permission))} label={label} />)}
          </div>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Expires after
            <select className={inputClass} value={shareExpiryDays} onChange={(event) => setShareExpiryDays(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="">Never</option></select>
          </label>
          {createdShareUrl ? <div className="rounded border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Copy this link now—the secret is shown only once.</p><div className="mt-2 flex gap-2"><input readOnly className={inputClass} value={createdShareUrl} /><button className={toolbarBtn} onClick={() => void navigator.clipboard.writeText(createdShareUrl)}>Copy</button></div></div> : null}
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Active links</p>{shares.length === 0 ? <p className="text-sm text-neutral-500">No active public links.</p> : <div className="grid gap-2">{shares.map((share) => <div key={share.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3 text-xs dark:border-slate-700"><div><p className="font-semibold">{share.permissions.join(', ')}</p><p className="mt-1 text-neutral-500">{share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : 'Never expires'}{share.lastAccessedAt ? ` · last opened ${new Date(share.lastAccessedAt).toLocaleString()}` : ' · never opened'}</p></div><button className={deleteBtn} onClick={() => { setShareRevokeError(null); setShareToRevoke(share); }} aria-label="Revoke public link">×</button></div>)}</div>}</div>
        </div>
      </DashboardDialog>

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
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void saveEdit()}>
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
  'min-h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-white dark:focus:ring-white/10';
const toolbarBtn =
  'inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const deleteBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400';
const secondaryBtn =
  'h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const primaryBtn =
  'h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200';
const dangerBtn =
  'h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60';

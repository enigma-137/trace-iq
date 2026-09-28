'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { withProjectId } from '../nav';
import {
  fetchDashboards,
  deleteDashboard,
  duplicateDashboard,
  updateDashboard
} from '@/lib/analytics-api';
import type { DashboardView } from '@/types/analytics';
import { NewDashboardModal } from './NewDashboardModal';
import { DashboardDialog } from '../DashboardDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageBanner } from '@/components/PageBanner';
import { toast } from '@/lib/toast';

export function DashboardsLibraryView({
  projectId,
  initialDashboards,
  userId
}: {
  projectId?: string;
  initialDashboards: DashboardView[];
  userId: string;
}) {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardView[]>(initialDashboards);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'pinned'>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Dialog states for Rename and Delete
  const [renamingDash, setRenamingDash] = useState<DashboardView | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameDesc, setRenameDesc] = useState('');
  const [deletingDash, setDeletingDash] = useState<DashboardView | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    loadDashboards();
  }, [projectId, activeTab]);

  async function loadDashboards() {
    setLoading(true);
    const { data, error } = await fetchDashboards({
      projectId,
      tab: activeTab,
      search: search.trim() || undefined
    });

    if (data?.dashboards) {
      setDashboards(data.dashboards);
    } else if (error) {
      toast.error(error);
    }
    setLoading(false);
  }

  async function handleTogglePin(dash: DashboardView) {
    const nextPinned = !dash.isPinned;
    const { data, error } = await updateDashboard(dash.id, {
      isPinned: nextPinned,
      projectId
    });

    if (data?.dashboard) {
      toast.success(nextPinned ? 'Dashboard pinned' : 'Dashboard unpinned');
      setDashboards((prev) => prev.map((d) => (d.id === dash.id ? data.dashboard : d)));
    } else {
      toast.error(error || 'Failed to update pin state');
    }
  }

  async function handleDuplicate(dash: DashboardView) {
    setActionBusy(true);
    const { data, error } = await duplicateDashboard(dash.id, projectId);
    setActionBusy(false);

    if (data?.dashboard) {
      toast.success(`Duplicated "${dash.name}"`);
      setDashboards((prev) => [data.dashboard, ...prev]);
    } else {
      toast.error(error || 'Failed to duplicate dashboard');
    }
  }

  async function handleRenameSubmit() {
    if (!renamingDash || !renameName.trim()) return;
    setActionBusy(true);
    const { data, error } = await updateDashboard(renamingDash.id, {
      name: renameName.trim(),
      description: renameDesc.trim() || undefined,
      projectId
    });
    setActionBusy(false);

    if (data?.dashboard) {
      toast.success('Updated dashboard details');
      setDashboards((prev) => prev.map((d) => (d.id === renamingDash.id ? data.dashboard : d)));
      setRenamingDash(null);
    } else {
      toast.error(error || 'Failed to update dashboard');
    }
  }

  async function handleDeleteSubmit() {
    if (!deletingDash) return;
    setActionBusy(true);
    const { error } = await deleteDashboard(deletingDash.id, projectId);
    setActionBusy(false);

    if (!error) {
      toast.success(`Deleted "${deletingDash.name}"`);
      setDashboards((prev) => prev.filter((d) => d.id !== deletingDash.id));
      setDeletingDash(null);
    } else {
      toast.error(error || 'Failed to delete dashboard');
    }
  }

  const filteredDashboards = dashboards.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      d.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Cloudflare/PostHog-style Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
            Dashboards
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Create, customize, and share real-time analytics workspaces.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-[0.98]"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            New dashboard
          </button>
        </div>
      </div>

      {/* Reusable In-App Banner */}
      <PageBanner
        dismissId="dashboards_banner_v1"
        badge="Workspace Canvas"
        title="Custom Analytics Dashboards"
        description="Assemble charts, funnels, retention cohorts, and KPI meters into shared executive boards or private workspaces."
        illustrationSrc="/dashboards/banner-create-dashboard.png"
        illustrationAlt="Create Dashboard Banner Artwork"
        primaryAction={{
          label: 'Create dashboard',
          onClick: () => setIsNewModalOpen(true),
          icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )
        }}
        secondaryAction={{
          label: 'Browse insights',
          href: withProjectId('/dashboard/insights', projectId)
        }}
      />

      {/* Control Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200/90 bg-white p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-1">
          {(['all', 'mine', 'pinned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition ${
                activeTab === tab
                  ? 'bg-neutral-100 text-neutral-900 font-semibold shadow-2xs dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {tab === 'all' ? 'All dashboards' : tab === 'mine' ? 'My dashboards' : 'Pinned'}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <svg
            className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dashboards..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 py-1.5 pl-8 pr-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-white"
          />
        </div>
      </div>

      {/* Main Content Container */}
      <div className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <div className="divide-y divide-neutral-100 p-4 space-y-3 dark:divide-neutral-800">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="space-y-1">
                  <div className="h-3.5 w-48 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                </div>
                <div className="h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : filteredDashboards.length === 0 ? (
          <EmptyState
            illustrationSrc="/dashboards/no-dashboard.png"
            illustrationAlt="No dashboards found"
            title={search ? 'No dashboards match your search' : 'No dashboards created yet'}
            description={
              search
                ? 'Try adjusting your search query or clear the filter to view all project boards.'
                : 'Get started by creating a dashboard from our curated templates or build a custom board from scratch.'
            }
            primaryAction={{
              label: 'Create dashboard',
              onClick: () => setIsNewModalOpen(true),
              icon: (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )
            }}
            secondaryAction={{
              label: 'Browse insights',
              href: withProjectId('/dashboard/insights', projectId)
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-[11px] font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-850/50 dark:text-neutral-400">
                  <th className="py-2.5 pl-4 pr-3">Dashboard</th>
                  <th className="px-3 py-2.5">Owner</th>
                  <th className="px-3 py-2.5 text-center">Widgets</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {filteredDashboards.map((dash) => (
                  <tr
                    key={dash.id}
                    className="group transition hover:bg-neutral-50/60 dark:hover:bg-neutral-850/40"
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(dash)}
                          title={dash.isPinned ? 'Unpin' : 'Pin to top'}
                          className={`text-neutral-400 hover:text-amber-500 ${
                            dash.isPinned ? 'text-amber-500' : ''
                          }`}
                        >
                          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </button>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="3" y="3" width="7" height="9" rx="1" strokeWidth={1.8} />
                            <rect x="14" y="3" width="7" height="5" rx="1" strokeWidth={1.8} />
                            <rect x="14" y="12" width="7" height="9" rx="1" strokeWidth={1.8} />
                            <rect x="3" y="16" width="7" height="5" rx="1" strokeWidth={1.8} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={withProjectId(`/dashboard/dashboards/${dash.id}`, projectId)}
                            className="font-medium text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                          >
                            {dash.name}
                          </Link>
                          {dash.description && (
                            <div className="line-clamp-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                              {dash.description}
                            </div>
                          )}
                          {dash.tags && dash.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {dash.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-neutral-100 px-1.5 py-0.2 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">
                      {dash.ownerEmail || 'Member'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {dash.widgetsCount ?? (dash.widgets?.length || 0)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                      {new Date(dash.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={withProjectId(`/dashboard/dashboards/${dash.id}`, projectId)}
                          className="rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          Open
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleDuplicate(dash)}
                          disabled={actionBusy}
                          title="Duplicate"
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRenamingDash(dash);
                            setRenameName(dash.name);
                            setRenameDesc(dash.description || '');
                          }}
                          title="Rename / Edit"
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingDash(dash)}
                          title="Delete"
                          className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Dashboard Modal */}
      {isNewModalOpen && (
        <NewDashboardModal
          isOpen={isNewModalOpen}
          onClose={() => {
            setIsNewModalOpen(false);
            loadDashboards();
          }}
          projectId={projectId}
        />
      )}

      {/* Rename Dialog */}
      {renamingDash && (
        <DashboardDialog
          isOpen={!!renamingDash}
          onClose={() => setRenamingDash(null)}
          title="Edit Dashboard Details"
          description="Update dashboard title and description."
          maxWidthClass="max-w-sm"
        >
          <div className="space-y-3 pt-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">Name</label>
              <input
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">Description</label>
              <textarea
                value={renameDesc}
                onChange={(e) => setRenameDesc(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenamingDash(null)}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                disabled={actionBusy || !renameName.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingDash && (
        <DashboardDialog
          isOpen={!!deletingDash}
          onClose={() => setDeletingDash(null)}
          title="Delete Dashboard"
          description={`Are you sure you want to delete "${deletingDash.name}"? This action cannot be undone.`}
          maxWidthClass="max-w-sm"
        >
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setDeletingDash(null)}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteSubmit}
              disabled={actionBusy}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </DashboardDialog>
      )}
    </div>
  );
}

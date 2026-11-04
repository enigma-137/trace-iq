'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import {
  LibraryHeader,
  LibrarySkeleton,
  LibraryToolbar,
  RowActionsMenu,
  formatLibraryDate
} from '@/components/library/LibraryParts';
import { ownerLabel } from '@/components/library/owner-label';
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

  // The server already rendered the first page of rows; only refetch on changes.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
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
    if (activeTab === 'pinned' && !d.isPinned) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      d.tags.some((t) => t.toLowerCase().includes(q))
    );
  }).sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  return (
    <div className="space-y-4">
      <LibraryHeader
        description="Group saved insights into a view you can share with your team."
        action={
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="self-start rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 sm:self-auto"
          >
            New dashboard
          </button>
        }
      />

      <LibraryToolbar
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'mine', label: 'Mine' },
          { id: 'pinned', label: 'Pinned' }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search dashboards"
      />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <LibrarySkeleton />
        ) : filteredDashboards.length === 0 ? (
          <EmptyState
            title={
              search
                ? 'No dashboards match your search'
                : activeTab === 'pinned'
                  ? 'No pinned dashboards'
                  : activeTab === 'mine'
                    ? 'You have no dashboards yet'
                    : 'No dashboards yet'
            }
            description={
              search
                ? 'Try a different name or description.'
                : activeTab === 'pinned'
                  ? 'Pin a dashboard from its row menu to keep it at the top of this list.'
                  : 'Start from a template, or create a blank dashboard and add insights to it.'
            }
            primaryAction={
              search || activeTab === 'pinned'
                ? undefined
                : { label: 'New dashboard', onClick: () => setIsNewModalOpen(true) }
            }
          />
        ) : (
          <table className="w-full table-fixed text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-[11px] font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="py-2.5 pl-4 pr-3 font-medium">Name</th>
                <th className="hidden w-56 px-3 py-2.5 font-medium sm:table-cell">Owner</th>
                <th className="hidden w-20 px-3 py-2.5 text-right font-medium md:table-cell">Charts</th>
                <th className="hidden w-32 px-3 py-2.5 font-medium md:table-cell">Updated</th>
                <th className="w-12 py-2.5 pl-3 pr-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredDashboards.map((dash) => {
                const mine = dash.ownerId === userId;
                return (
                  <tr
                    key={dash.id}
                    className="relative transition hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <svg
                          className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <rect x="3" y="3" width="7" height="9" rx="1" strokeWidth={1.8} />
                          <rect x="14" y="3" width="7" height="5" rx="1" strokeWidth={1.8} />
                          <rect x="14" y="12" width="7" height="9" rx="1" strokeWidth={1.8} />
                          <rect x="3" y="16" width="7" height="5" rx="1" strokeWidth={1.8} />
                        </svg>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={withProjectId(`/dashboard/dashboards/${dash.id}`, projectId)}
                              className="truncate font-medium text-neutral-900 after:absolute after:inset-0 dark:text-white"
                            >
                              {dash.name}
                            </Link>
                            {dash.isPinned && (
                              <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                                Pinned
                              </span>
                            )}
                          </div>
                          {dash.description && (
                            <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                              {dash.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-3 text-neutral-600 sm:table-cell dark:text-neutral-400">
                      {ownerLabel(dash.ownerId, dash.ownerEmail, userId)}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-neutral-600 md:table-cell dark:text-neutral-400">
                      {dash.widgetsCount ?? (dash.widgets?.length || 0)}
                    </td>
                    <td className="hidden px-3 py-3 text-neutral-500 md:table-cell dark:text-neutral-400">
                      {formatLibraryDate(dash.updatedAt)}
                    </td>
                    <td className="py-3 pl-3 pr-3 text-right">
                      <RowActionsMenu
                        label={`Actions for ${dash.name}`}
                        actions={[
                          ...(mine
                            ? [{ label: dash.isPinned ? 'Unpin' : 'Pin', onSelect: () => handleTogglePin(dash) }]
                            : []),
                          { label: 'Duplicate', onSelect: () => handleDuplicate(dash), disabled: actionBusy },
                          ...(mine
                            ? [
                                {
                                  label: 'Edit details',
                                  onSelect: () => {
                                    setRenamingDash(dash);
                                    setRenameName(dash.name);
                                    setRenameDesc(dash.description || '');
                                  }
                                },
                                { label: 'Delete', danger: true, onSelect: () => setDeletingDash(dash) }
                              ]
                            : [])
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

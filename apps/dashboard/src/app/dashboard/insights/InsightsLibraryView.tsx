'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { withProjectId } from '../nav';
import {
  fetchInsights,
  deleteInsight,
  duplicateInsight,
  updateInsight
} from '@/lib/analytics-api';
import type { SavedInsightView } from '@/types/analytics';
import { AddToDashboardModal } from '@/components/dashboards/AddToDashboardModal';
import { DashboardDialog } from '../DashboardDialog';
import { InsightTypeIcon } from '@/components/insights/InsightTypeIcon';
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

const INSIGHT_TYPE_LABELS: Record<string, string> = {
  trend: 'Trend',
  kpi: 'KPI',
  funnel: 'Funnel',
  retention: 'Retention',
  event_breakdown: 'Event breakdown',
  user_metric: 'User metric',
  web_analytics: 'Web analytics',
  revenue: 'Revenue',
  error_metric: 'Error metric',
  api_performance: 'API performance',
  web_vitals: 'Web Vitals',
  feature_adoption: 'Feature adoption',
  table: 'Table'
};

export function InsightsLibraryView({
  projectId,
  initialInsights,
  userId
}: {
  projectId?: string;
  initialInsights: SavedInsightView[];
  userId: string;
}) {
  const [insights, setInsights] = useState<SavedInsightView[]>(initialInsights);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'pinned'>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Actions dialog states
  const [addToDashboardInsight, setAddToDashboardInsight] = useState<SavedInsightView | null>(null);
  const [renamingInsight, setRenamingInsight] = useState<SavedInsightView | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingInsight, setDeletingInsight] = useState<SavedInsightView | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // The server already rendered the first page of rows; only refetch on changes.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    loadInsights();
  }, [projectId, activeTab, selectedType]);

  async function loadInsights() {
    setLoading(true);
    const { data, error } = await fetchInsights({
      projectId,
      tab: activeTab,
      type: selectedType !== 'all' ? selectedType : undefined,
      search: search.trim() || undefined
    });

    if (data?.insights) {
      setInsights(data.insights);
    } else if (error) {
      toast.error(error);
    }
    setLoading(false);
  }

  async function handleTogglePin(insight: SavedInsightView) {
    const isPinned = !insight.isPinned;
    const { data, error } = await updateInsight(insight.id, { isPinned, projectId });

    if (data?.insight) {
      toast.success(isPinned ? 'Insight pinned' : 'Insight unpinned');
      setInsights((prev) => prev.map((item) => (item.id === insight.id ? data.insight : item)));
    } else {
      toast.error(error || 'Failed to update pin state');
    }
  }

  async function handleDuplicate(insight: SavedInsightView) {
    setActionBusy(true);
    const { data, error } = await duplicateInsight(insight.id, projectId);
    setActionBusy(false);

    if (data?.insight) {
      toast.success(`Duplicated "${insight.name}"`);
      setInsights((prev) => [data.insight, ...prev]);
    } else {
      toast.error(error || 'Failed to duplicate insight');
    }
  }

  async function handleRenameSubmit() {
    if (!renamingInsight || !renameValue.trim()) return;
    setActionBusy(true);
    const { data, error } = await updateInsight(renamingInsight.id, {
      name: renameValue.trim(),
      projectId
    });
    setActionBusy(false);

    if (data?.insight) {
      toast.success('Renamed insight');
      setInsights((prev) =>
        prev.map((item) => (item.id === renamingInsight.id ? data.insight : item))
      );
      setRenamingInsight(null);
    } else {
      toast.error(error || 'Failed to rename insight');
    }
  }

  async function handleDeleteSubmit() {
    if (!deletingInsight) return;
    setActionBusy(true);
    const { error } = await deleteInsight(deletingInsight.id, projectId);
    setActionBusy(false);

    if (!error) {
      toast.success(`Deleted "${deletingInsight.name}"`);
      setInsights((prev) => prev.filter((item) => item.id !== deletingInsight.id));
      setDeletingInsight(null);
    } else {
      toast.error(error || 'Failed to delete insight');
    }
  }

  const filteredInsights = insights.filter((i) => {
    if (activeTab === 'pinned' && !i.isPinned) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      i.type.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q))
    );
  }).sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  const isFiltering = Boolean(search) || selectedType !== 'all';

  return (
    <div className="space-y-4">
      <LibraryHeader
        description="Saved charts of your events. Add any of them to a dashboard."
        action={
          <Link
            href={withProjectId('/dashboard/insights/new', projectId)}
            className="self-start rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 sm:self-auto"
          >
            New insight
          </Link>
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
        searchPlaceholder="Search insights"
      >
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          aria-label="Filter by type"
          className="rounded-md border border-neutral-200 bg-transparent px-2 py-1.5 text-xs text-neutral-700 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:text-neutral-300 dark:focus:border-neutral-600"
        >
          <option value="all">All types</option>
          {Object.entries(INSIGHT_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </LibraryToolbar>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <LibrarySkeleton />
        ) : filteredInsights.length === 0 ? (
          <EmptyState
            title={
              isFiltering
                ? 'No matching insights'
                : activeTab === 'pinned'
                  ? 'No pinned insights'
                  : activeTab === 'mine'
                    ? 'You have no insights yet'
                    : 'No insights yet'
            }
            description={
              isFiltering
                ? 'Try a different search or clear the type filter.'
                : activeTab === 'pinned'
                  ? 'Pin an insight from its row menu to keep it at the top of this list.'
                  : (
                    <>
                      <p>
                        An insight is a saved chart of your events: how often something happens, how many people do it, or
                        the sum or average of a value over time.
                      </p>
                      <Link
                        href="/docs?page=insights"
                        className="mt-2 inline-block font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                      >
                        Read the setup guide
                      </Link>
                    </>
                  )
            }
            primaryAction={
              isFiltering || activeTab === 'pinned'
                ? undefined
                : { label: 'New insight', href: withProjectId('/dashboard/insights/new', projectId) }
            }
          />
        ) : (
          <table className="w-full table-fixed text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-[11px] font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="py-2.5 pl-4 pr-3 font-medium">Name</th>
                <th className="hidden w-32 px-3 py-2.5 font-medium lg:table-cell">Type</th>
                <th className="hidden w-56 px-3 py-2.5 font-medium sm:table-cell">Created by</th>
                <th className="hidden w-24 px-3 py-2.5 text-right font-medium md:table-cell">Dashboards</th>
                <th className="hidden w-32 px-3 py-2.5 font-medium md:table-cell">Updated</th>
                <th className="w-12 py-2.5 pl-3 pr-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredInsights.map((insight) => (
                <tr
                  key={insight.id}
                  className="relative transition hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                >
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <InsightTypeIcon type={insight.type} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={withProjectId(`/dashboard/insights/${insight.id}`, projectId)}
                            className="truncate font-medium text-neutral-900 after:absolute after:inset-0 dark:text-white"
                          >
                            {insight.name}
                          </Link>
                          {insight.isPinned && (
                            <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                              Pinned
                            </span>
                          )}
                        </div>
                        {insight.description && (
                          <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {insight.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden truncate px-3 py-3 text-neutral-600 lg:table-cell dark:text-neutral-400">
                    {INSIGHT_TYPE_LABELS[insight.type] || insight.type}
                  </td>
                  <td className="hidden truncate px-3 py-3 text-neutral-600 sm:table-cell dark:text-neutral-400">
                    {ownerLabel(insight.createdByUserId, insight.createdByUserEmail, userId)}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-neutral-600 md:table-cell dark:text-neutral-400">
                    {insight.usedInDashboardsCount || 0}
                  </td>
                  <td className="hidden px-3 py-3 text-neutral-500 md:table-cell dark:text-neutral-400">
                    {formatLibraryDate(insight.updatedAt)}
                  </td>
                  <td className="py-3 pl-3 pr-3 text-right">
                    <RowActionsMenu
                      label={`Actions for ${insight.name}`}
                      actions={[
                        { label: 'Add to dashboard', onSelect: () => setAddToDashboardInsight(insight) },
                        { label: insight.isPinned ? 'Unpin' : 'Pin', onSelect: () => handleTogglePin(insight) },
                        { label: 'Duplicate', onSelect: () => handleDuplicate(insight), disabled: actionBusy },
                        {
                          label: 'Rename',
                          onSelect: () => {
                            setRenamingInsight(insight);
                            setRenameValue(insight.name);
                          }
                        },
                        { label: 'Delete', danger: true, onSelect: () => setDeletingInsight(insight) }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add To Dashboard Modal */}
      {addToDashboardInsight && (
        <AddToDashboardModal
          isOpen={!!addToDashboardInsight}
          onClose={() => setAddToDashboardInsight(null)}
          projectId={projectId}
          insightId={addToDashboardInsight.id}
          insightName={addToDashboardInsight.name}
        />
      )}

      {/* Rename Dialog */}
      {renamingInsight && (
        <DashboardDialog
          isOpen={!!renamingInsight}
          onClose={() => setRenamingInsight(null)}
          title="Rename Insight"
          description="Enter a new name for this saved insight."
          maxWidthClass="max-w-sm"
        >
          <div className="space-y-4 pt-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingInsight(null)}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                disabled={actionBusy || !renameValue.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingInsight && (
        <DashboardDialog
          isOpen={!!deletingInsight}
          onClose={() => setDeletingInsight(null)}
          title="Delete Insight"
          description={`Are you sure you want to delete "${deletingInsight.name}"? This will also remove it from any dashboards that display it.`}
          maxWidthClass="max-w-sm"
        >
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setDeletingInsight(null)}
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

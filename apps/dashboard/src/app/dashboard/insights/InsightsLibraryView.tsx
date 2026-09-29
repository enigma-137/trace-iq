'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { PageBanner } from '@/components/PageBanner';
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

const TYPE_BADGE_STYLES: Record<string, string> = {
  trend: 'text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900',
  kpi: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
  funnel: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  retention: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900',
  user_metric: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900',
  event_breakdown: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  web_analytics: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900',
  revenue: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  error_metric: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900',
  api_performance: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900'
};

export function InsightsLibraryView({
  projectId,
  initialInsights
}: {
  projectId?: string;
  initialInsights: SavedInsightView[];
}) {
  const router = useRouter();
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

  useEffect(() => {
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
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      i.type.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Cloudflare-style Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
            Insights Library
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Create, save, and embed reusable analytical charts into your dashboards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={withProjectId('/dashboard/insights/new', projectId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-[0.98]"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            New insight
          </Link>
        </div>
      </div>

      {/* Reusable In-App Banner */}
      <PageBanner
        dismissId="insights_banner_v1"
        badge="Analytics Engine"
        title="Deep-Dive Product Insights"
        description="Query time-series event trends, measure step-by-step conversion funnels, track 4-week cohort retention, and monitor API performance."
        illustrationSrc="/dashboards/banner-insights.png"
        illustrationAlt="Insights Banner Artwork"
        primaryAction={{
          label: 'Create insight',
          href: withProjectId('/dashboard/insights/new', projectId),
          icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )
        }}
        secondaryAction={{
          label: 'View dashboards',
          href: withProjectId('/dashboard/dashboards', projectId)
        }}
      />

      {/* Control Bar: Tabs + Search + Type Filter */}
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200/90 bg-white p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-1">
          {(['all', 'mine', 'pinned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition ${activeTab === tab
                  ? 'bg-neutral-100 text-neutral-900 font-semibold shadow-2xs dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
            >
              {tab === 'all' ? 'All insights' : tab === 'mine' ? 'My insights' : 'Pinned'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
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
              placeholder="Search insights..."
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 py-1.5 pl-8 pr-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-white dark:focus:bg-neutral-900"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-neutral-50/60 py-1.5 px-3 text-xs text-neutral-700 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-300"
          >
            <option value="all">All types</option>
            {Object.entries(INSIGHT_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {loading ? (
          <div className="divide-y divide-neutral-100 p-4 space-y-3 dark:divide-neutral-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="space-y-1">
                  <div className="h-3.5 w-48 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                </div>
                <div className="h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : filteredInsights.length === 0 ? (
          <EmptyState
            illustrationSrc="/dashboards/no-insights.png"
            illustrationAlt="No insights found"
            title={search || selectedType !== 'all' ? 'No matching insights' : 'No insights created yet'}
            description={
              search || selectedType !== 'all'
                ? 'Try adjusting your search keywords or clearing the category filter.'
                : 'Create your first insight to analyze event trends, KPIs, conversion funnels, and retention cohorts.'
            }
            primaryAction={{
              label: 'Create insight',
              href: withProjectId('/dashboard/insights/new', projectId),
              icon: (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )
            }}
            secondaryAction={{
              label: 'View dashboards',
              href: withProjectId('/dashboard/dashboards', projectId)
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-[11px] font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-850/50 dark:text-neutral-400">
                  <th className="py-2.5 pl-4 pr-3">Name</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Created by</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="px-3 py-2.5 text-center">In dashboards</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {filteredInsights.map((insight) => {
                  const badgeClass =
                    TYPE_BADGE_STYLES[insight.type] ||
                    'bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700';
                  return (
                    <tr
                      key={insight.id}
                      className="group transition hover:bg-neutral-50/60 dark:hover:bg-neutral-850/40"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-start gap-3">
                          <InsightTypeIcon type={insight.type} size="md" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={withProjectId(`/dashboard/insights/${insight.id}`, projectId)}
                              className="font-medium text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                            >
                              {insight.name}
                            </Link>
                            {insight.description && (
                              <div className="line-clamp-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                                {insight.description}
                              </div>
                            )}
                            {insight.tags && insight.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {insight.tags.map((t) => (
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
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}
                        >
                          {INSIGHT_TYPE_LABELS[insight.type] || insight.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">
                        {insight.createdByUserEmail || 'Member'}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                        {new Date(insight.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {insight.usedInDashboardsCount || 0}
                        </span>
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAddToDashboardInsight(insight)}
                            className="rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            + Dashboard
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicate(insight)}
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
                              setRenamingInsight(insight);
                              setRenameValue(insight.name);
                            }}
                            title="Rename"
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
                            onClick={() => setDeletingInsight(insight)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
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

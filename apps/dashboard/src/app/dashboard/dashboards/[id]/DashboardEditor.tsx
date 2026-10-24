'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { withProjectId } from '../../nav';
import {
  updateDashboard,
  addDashboardWidget,
  updateDashboardWidget,
  removeDashboardWidget,
  updateDashboardLayout,
  executeInsightQuery,
  fetchInsights
} from '@/lib/analytics-api';
import type {
  DashboardView,
  DashboardWidgetView,
  SavedInsightView
} from '@/types/analytics';
import { InsightTypeIcon } from '@/components/insights/InsightTypeIcon';
import { InsightChartRenderer } from '@/components/charts/InsightChartRenderer';
import { EmptyDashboardBuilder } from '../EmptyDashboardBuilder';
import { NewDashboardModal } from '../NewDashboardModal';
import { DashboardDialog } from '../../DashboardDialog';
import { toast } from '@/lib/toast';

interface DashboardEditorProps {
  projectId?: string;
  initialDashboard: DashboardView;
}

export function DashboardEditor({ projectId, initialDashboard }: DashboardEditorProps) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardView>(initialDashboard);
  const [widgets, setWidgets] = useState<DashboardWidgetView[]>(initialDashboard.widgets || []);
  const [globalDays, setGlobalDays] = useState<string>(
    (initialDashboard.filters?.days as string) || '30'
  );
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Drag and drop state
  const [draggedWidgetIndex, setDraggedWidgetIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Modals state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isAddChartOpen, setIsAddChartOpen] = useState(false);
  const [availableInsights, setAvailableInsights] = useState<SavedInsightView[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightSearch, setInsightSearch] = useState('');

  // Dashboard details edit state
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [editName, setEditName] = useState(initialDashboard.name);
  const [editDesc, setEditDesc] = useState(initialDashboard.description || '');
  const [savingDetails, setSavingDetails] = useState(false);

  // Widget editing state
  const [editingWidget, setEditingWidget] = useState<DashboardWidgetView | null>(null);
  const [widgetTitle, setWidgetTitle] = useState('');

  useEffect(() => {
    if (initialDashboard.widgets) {
      setWidgets(initialDashboard.widgets);
    }
  }, [initialDashboard]);

  // Load insights for the "+ Add Chart" modal
  useEffect(() => {
    if (!isAddChartOpen) return;
    setInsightsLoading(true);
    fetchInsights({ projectId })
      .then(({ data }) => {
        if (data?.insights) {
          setAvailableInsights(data.insights);
        }
      })
      .finally(() => setInsightsLoading(false));
  }, [isAddChartOpen, projectId]);

  const persistLayout = useCallback(
    async (updatedWidgets: DashboardWidgetView[]) => {
      const layoutPayload = updatedWidgets.map((w, idx) => ({
        widgetId: w.id,
        position: idx,
        layout: w.layout
      }));
      await updateDashboardLayout(dashboard.id, layoutPayload, projectId);
    },
    [dashboard.id, projectId]
  );

  async function handleAddExistingInsight(insight: SavedInsightView) {
    const defaultW = insight.type === 'kpi' ? 4 : 6;
    const { data, error } = await addDashboardWidget(dashboard.id, {
      insightId: insight.id,
      title: insight.name,
      layout: { w: defaultW },
      projectId
    });

    if (error) {
      toast.error(error);
    } else if (data?.widget) {
      toast.success(`Added "${insight.name}" to dashboard`);
      setWidgets((prev) => [...prev, data.widget]);
      setIsAddChartOpen(false);
    }
  }

  async function handleRemoveWidget(widgetId: string) {
    const { error } = await removeDashboardWidget(dashboard.id, widgetId, projectId);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Removed widget');
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    }
  }

  async function handleResizeWidget(widgetId: string, newW: number, newH?: number) {
    const updated = widgets.map((w) =>
      w.id === widgetId
        ? { ...w, layout: { ...(w.layout || {}), w: newW, ...(newH !== undefined ? { h: newH } : {}) } }
        : w
    );
    setWidgets(updated);

    await updateDashboardWidget(dashboard.id, widgetId, {
      layout: { w: newW, ...(newH !== undefined ? { h: newH } : {}) },
      projectId
    });
  }

  // Button-based reordering (accessible & mobile fallback)
  async function handleMoveWidget(widgetIndex: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? widgetIndex - 1 : widgetIndex + 1;
    if (targetIndex < 0 || targetIndex >= widgets.length) return;

    const newWidgets = [...widgets];
    const [moved] = newWidgets.splice(widgetIndex, 1);
    newWidgets.splice(targetIndex, 0, moved);

    const reordered = newWidgets.map((w, idx) => ({ ...w, position: idx }));
    setWidgets(reordered);
    await persistLayout(reordered);
  }

  // Drag and Drop handlers
  function handleDragStart(index: number) {
    setDraggedWidgetIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedWidgetIndex === null || draggedWidgetIndex === index) return;
    setDragOverIndex(index);
  }

  async function handleDrop(targetIndex: number) {
    if (draggedWidgetIndex === null || draggedWidgetIndex === targetIndex) {
      setDraggedWidgetIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newWidgets = [...widgets];
    const [dragged] = newWidgets.splice(draggedWidgetIndex, 1);
    newWidgets.splice(targetIndex, 0, dragged);

    const reordered = newWidgets.map((w, idx) => ({ ...w, position: idx }));
    setWidgets(reordered);
    setDraggedWidgetIndex(null);
    setDragOverIndex(null);
    toast.success('Dashboard layout updated');
    await persistLayout(reordered);
  }

  function handleDragEnd() {
    setDraggedWidgetIndex(null);
    setDragOverIndex(null);
  }

  async function handleSaveDetails() {
    if (!editName.trim()) return;
    setSavingDetails(true);
    const { data, error } = await updateDashboard(dashboard.id, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      projectId
    });
    setSavingDetails(false);

    if (error) {
      toast.error(error);
    } else if (data?.dashboard) {
      toast.success('Updated dashboard');
      setDashboard(data.dashboard);
      setIsEditDetailsOpen(false);
    }
  }

  async function handleSaveWidgetTitle() {
    if (!editingWidget || !widgetTitle.trim()) return;
    const { data, error } = await updateDashboardWidget(dashboard.id, editingWidget.id, {
      title: widgetTitle.trim(),
      projectId
    });

    if (error) {
      toast.error(error);
    } else if (data?.widget) {
      toast.success('Widget updated');
      setWidgets((prev) => prev.map((w) => (w.id === editingWidget.id ? data.widget : w)));
      setEditingWidget(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Link
              href={withProjectId('/dashboard/dashboards', projectId)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            >
              ← Dashboards
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-base font-semibold text-neutral-900 dark:text-white">
              {dashboard.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditName(dashboard.name);
                setEditDesc(dashboard.description || '');
                setIsEditDetailsOpen(true);
              }}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              title="Edit dashboard details"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
          {dashboard.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{dashboard.description}</p>
          )}
        </div>

        {/* Global Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Date Filter */}
          <div className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <span className="text-neutral-400">Window:</span>
            <select
              value={globalDays}
              onChange={(e) => setGlobalDays(e.target.value)}
              className="bg-transparent font-medium text-neutral-800 focus:outline-none dark:text-neutral-200"
            >
              <option value="1">Last 24h</option>
              <option value="7">Last 7d</option>
              <option value="14">Last 14d</option>
              <option value="30">Last 30d</option>
              <option value="90">Last 90d</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setRefreshCounter((c) => c + 1)}
            title="Refresh dashboard widgets"
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-850"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setIsAddChartOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add chart
          </button>
        </div>
      </div>

      {/* Main Responsive Grid Canvas */}
      {widgets.length === 0 ? (
        <EmptyDashboardBuilder
          dashboardId={dashboard.id}
          projectId={projectId}
          onAddExistingChart={() => setIsAddChartOpen(true)}
          onBrowseTemplates={() => setIsTemplateModalOpen(true)}
          onWidgetAdded={(w) => setWidgets((prev) => [...prev, w])}
          onCreateNewInsight={(starterQuestion) => {
            const query = starterQuestion ? `&goal=${encodeURIComponent(starterQuestion)}` : '';
            router.push(
              withProjectId(
                `/dashboard/insights/new?returnDashboardId=${dashboard.id}${query}`,
                projectId
              )
            );
          }}
        />
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((widget, idx) => {
            const width = widget.layout?.w || 6;
            const colClass =
              width === 4
                ? 'col-span-12 lg:col-span-4'
                : width === 8
                ? 'col-span-12 lg:col-span-8'
                : width === 12
                ? 'col-span-12'
                : 'col-span-12 lg:col-span-6';

            const isDraggingThis = draggedWidgetIndex === idx;
            const isDragOverThis = dragOverIndex === idx;

            return (
              <div
                key={widget.id}
                className={`${colClass} transition-all duration-150 ${
                  isDraggingThis ? 'opacity-40 scale-[0.98]' : ''
                } ${isDragOverThis ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-neutral-900' : ''}`}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
              >
                <DashboardWidgetCard
                  widget={widget}
                  index={idx}
                  totalWidgets={widgets.length}
                  globalDays={globalDays}
                  refreshTrigger={refreshCounter}
                  projectId={projectId}
                  dashboardId={dashboard.id}
                  onResize={(w, h) => handleResizeWidget(widget.id, w, h)}
                  onMove={(dir) => handleMoveWidget(idx, dir)}
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnd={handleDragEnd}
                  onEdit={() => {
                    setEditingWidget(widget);
                    setWidgetTitle(widget.title || widget.insight?.name || 'Chart Widget');
                  }}
                  onRemove={() => handleRemoveWidget(widget.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Add Chart Modal */}
      {isAddChartOpen && (
        <DashboardDialog
          isOpen={isAddChartOpen}
          onClose={() => setIsAddChartOpen(false)}
          title="Add chart to dashboard"
          description="Choose an existing saved insight or create a new one."
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={insightSearch}
                onChange={(e) => setInsightSearch(e.target.value)}
                placeholder="Search insights..."
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                autoFocus
              />
            </div>

            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {insightsLoading ? (
                <div className="space-y-2 py-4">
                  <div className="h-8 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="h-8 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                </div>
              ) : availableInsights.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-400">
                  No saved insights available in this project.
                </div>
              ) : (
                availableInsights
                  .filter((i) => i.name.toLowerCase().includes(insightSearch.toLowerCase()))
                  .map((insight) => (
                    <div
                      key={insight.id}
                      onClick={() => handleAddExistingInsight(insight)}
                      className="flex cursor-pointer items-center justify-between rounded-md border border-neutral-200 bg-white p-2.5 text-xs transition hover:border-blue-500/40 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-850"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium text-neutral-900 dark:text-white">
                          {insight.name}
                        </div>
                        {insight.description && (
                          <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {insight.description}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          {insight.type}
                        </span>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          + Add
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <Link
                href={withProjectId(
                  `/dashboard/insights/new?dashboardId=${dashboard.id}`,
                  projectId
                )}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Create new insight
              </Link>

              <button
                type="button"
                onClick={() => setIsAddChartOpen(false)}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
              >
                Close
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}

      {/* Edit Dashboard Details Dialog */}
      {isEditDetailsOpen && (
        <DashboardDialog
          isOpen={isEditDetailsOpen}
          onClose={() => setIsEditDetailsOpen(false)}
          title="Edit Dashboard"
          description="Update dashboard title and description."
          maxWidthClass="max-w-sm"
        >
          <div className="space-y-3 pt-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditDetailsOpen(false)}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDetails}
                disabled={savingDetails || !editName.trim()}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}

      {/* Edit Widget Title Dialog */}
      {editingWidget && (
        <DashboardDialog
          isOpen={!!editingWidget}
          onClose={() => setEditingWidget(null)}
          title="Edit Widget"
          description="Change the display title for this widget card."
          maxWidthClass="max-w-sm"
        >
          <div className="space-y-3 pt-2">
            <input
              type="text"
              value={widgetTitle}
              onChange={(e) => setWidgetTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingWidget(null)}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveWidgetTitle}
                disabled={!widgetTitle.trim()}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}

      {/* Browse / Instantiate Templates Dialog */}
      {isTemplateModalOpen && (
        <NewDashboardModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
}

// ----------------- Individual Widget Boundary Card -----------------

function DashboardWidgetCard({
  widget,
  index,
  totalWidgets,
  globalDays,
  refreshTrigger,
  projectId,
  dashboardId,
  onResize,
  onMove,
  onDragStart,
  onDragEnd,
  onEdit,
  onRemove
}: {
  widget: DashboardWidgetView;
  index: number;
  totalWidgets: number;
  globalDays: string;
  refreshTrigger: number;
  projectId?: string;
  dashboardId: string;
  onResize: (w: number, h?: number) => void;
  onMove: (dir: 'up' | 'down') => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const insight = widget.insight;
  const currentW = widget.layout?.w || 6;
  const currentH = widget.layout?.h || 1;

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartWidthRef = useRef<number>(currentW);

  useEffect(() => {
    runWidgetQuery();
  }, [widget.id, widget.insightId, globalDays, refreshTrigger]);

  async function runWidgetQuery() {
    setLoading(true);
    setError(null);

    const { data: res, error: err } = await executeInsightQuery({
      insightId: widget.insightId || undefined,
      type: (widget.widgetType as any) || insight?.type || 'trend',
      query: { ...(insight?.query || {}), ...(widget.queryOverride || {}) },
      visualization: { ...(insight?.visualization || {}), ...(widget.visualizationOverride || {}) },
      globalOverrides: {
        days: globalDays
      },
      projectId
    });

    setLoading(false);
    if (err) {
      setError(err);
    } else if (res) {
      setData(res.data !== undefined ? res.data : res.result !== undefined ? res.result : res);
    }
  }

  // Interactive mouse drag resize
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = currentW;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - resizeStartXRef.current;
      // Step thresholds (roughly 160px per 2 column units)
      if (deltaX < -120) {
        if (resizeStartWidthRef.current === 12) onResize(8);
        else if (resizeStartWidthRef.current === 8) onResize(6);
        else if (resizeStartWidthRef.current === 6) onResize(4);
      } else if (deltaX > 120) {
        if (resizeStartWidthRef.current === 4) onResize(6);
        else if (resizeStartWidthRef.current === 6) onResize(8);
        else if (resizeStartWidthRef.current === 8) onResize(12);
      }
    }

    function handleMouseUp() {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  const title = widget.title || insight?.name || 'Chart Widget';
  const type = (widget.widgetType as any) || insight?.type || 'trend';
  const visualization = { ...(insight?.visualization || {}), ...(widget.visualizationOverride || {}) };

  const chartHeight =
    currentH === 2
      ? 380
      : currentW === 4 && (type === 'kpi' || visualization?.chartType === 'kpi')
      ? 140
      : 220;

  return (
    <div
      ref={cardRef}
      className={`group relative flex h-full flex-col rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 ${
        isResizing ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      {/* Widget Header */}
      <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-2.5 dark:border-neutral-800/80">
        <div className="flex min-w-0 items-center gap-2 pr-2">
          {/* Desktop Drag Handle */}
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            title="Drag to reposition widget in grid"
            className="hidden cursor-grab rounded p-0.5 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 sm:block"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>

          <InsightTypeIcon type={type} size="sm" />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="truncate text-xs font-semibold text-neutral-900 dark:text-white">
                {title}
              </h4>
              {insight && (
                <Link
                  href={withProjectId(
                    `/dashboard/insights/${insight.id}?dashboardId=${dashboardId}`,
                    projectId
                  )}
                  title="Open underlying insight in builder"
                  className="text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              )}
            </div>
            {widget.description && (
              <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                {widget.description}
              </p>
            )}
          </div>
        </div>

        {/* Hover Controls for Resizing, Reordering, and Removal */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Mobile/Accessible Reorder Buttons */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => onMove('up')}
              title="Move left/up"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {index < totalWidgets - 1 && (
            <button
              type="button"
              onClick={() => onMove('down')}
              title="Move right/down"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Width Size Switcher */}
          <div className="flex items-center rounded border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-850">
            <button
              type="button"
              onClick={() => onResize(4)}
              title="1/3 width (4 cols)"
              className={`rounded px-1 text-[10px] font-mono ${
                currentW === 4 ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'
              }`}
            >
              ⅓
            </button>
            <button
              type="button"
              onClick={() => onResize(6)}
              title="1/2 width (6 cols)"
              className={`rounded px-1 text-[10px] font-mono ${
                currentW === 6 ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'
              }`}
            >
              ½
            </button>
            <button
              type="button"
              onClick={() => onResize(8)}
              title="2/3 width (8 cols)"
              className={`rounded px-1 text-[10px] font-mono ${
                currentW === 8 ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'
              }`}
            >
              ⅔
            </button>
            <button
              type="button"
              onClick={() => onResize(12)}
              title="Full width (12 cols)"
              className={`rounded px-1 text-[10px] font-mono ${
                currentW === 12 ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'
              }`}
            >
              Full
            </button>
          </div>

          <button
            type="button"
            onClick={onEdit}
            title="Edit title"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onRemove}
            title="Remove widget"
            className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Widget Chart Body */}
      <div className="flex flex-1 items-center justify-center">
        <InsightChartRenderer
          type={type}
          visualization={visualization}
          data={data}
          loading={loading}
          error={error}
          onRetry={runWidgetQuery}
          onConfigure={
            insight?.id
              ? () => router.push(withProjectId(`/dashboard/insights/${insight.id}?dashboardId=${dashboardId}`, projectId))
              : undefined
          }
          height={chartHeight}
        />
      </div>

      {/* Desktop Interactive Drag-to-Resize Handle */}
      <div
        onMouseDown={startResize}
        title="Drag horizontally to resize width"
        className="absolute bottom-1 right-1 hidden cursor-nwse-resize p-1 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-600 dark:text-neutral-700 dark:hover:text-neutral-300 sm:block"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 19H9m10 0V9m0 10L9 9" />
        </svg>
      </div>
    </div>
  );
}

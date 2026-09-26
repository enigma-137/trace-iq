'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardDialog } from '@/app/dashboard/DashboardDialog';
import { fetchDashboards, createDashboard, addDashboardWidget } from '@/lib/analytics-api';
import type { DashboardView, InsightType, VisualizationType } from '@/types/analytics';
import { toast } from '@/lib/toast';

export interface AddToDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  // If adding an existing saved insight:
  insightId?: string;
  insightName?: string;
  // Or if creating a new insight inline from an active telemetry view:
  newInsightPayload?: {
    name: string;
    description?: string;
    type: InsightType;
    chartType?: VisualizationType;
    query: Record<string, any>;
    visualization?: Record<string, any>;
    filters?: any[];
    dateConfig?: Record<string, any>;
  };
  onSuccess?: (dashboardId: string) => void;
}

export function AddToDashboardModal({
  isOpen,
  onClose,
  projectId,
  insightId,
  insightName,
  newInsightPayload,
  onSuccess
}: AddToDashboardModalProps) {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardView[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setIsCreatingNew(false);
    setNewDashboardName('');

    fetchDashboards({ projectId })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err);
        } else if (data?.dashboards) {
          setDashboards(data.dashboards);
          if (data.dashboards.length > 0) {
            setSelectedDashboardId(data.dashboards[0].id);
          } else {
            setIsCreatingNew(true);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const filteredDashboards = dashboards.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.description && d.description.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd() {
    setSubmitting(true);
    setError(null);

    try {
      let targetDashboardId = selectedDashboardId;

      if (isCreatingNew) {
        if (!newDashboardName.trim()) {
          setError('Please provide a name for the new dashboard.');
          setSubmitting(false);
          return;
        }

        const { data: created, error: createErr } = await createDashboard({
          name: newDashboardName.trim(),
          projectId
        });

        if (createErr || !created?.dashboard) {
          setError(createErr || 'Failed to create dashboard.');
          setSubmitting(false);
          return;
        }

        targetDashboardId = created.dashboard.id;
      }

      if (!targetDashboardId) {
        setError('Please select or create a dashboard.');
        setSubmitting(false);
        return;
      }

      const itemTitle = insightName || newInsightPayload?.name || 'Chart Widget';

      if (insightId) {
        const { error: widgetErr } = await addDashboardWidget(targetDashboardId, {
          insightId,
          title: itemTitle,
          layout: { w: 6 },
          projectId
        });

        if (widgetErr) {
          setError(widgetErr);
          toast.error(widgetErr || 'Could not add insight to dashboard.');
          setSubmitting(false);
          return;
        }
      } else if (newInsightPayload) {
        const { error: widgetErr } = await addDashboardWidget(targetDashboardId, {
          newInsight: {
            name: newInsightPayload.name,
            description: newInsightPayload.description,
            type: newInsightPayload.type,
            query: newInsightPayload.query,
            visualization: {
              chartType: newInsightPayload.chartType || 'line',
              ...(newInsightPayload.visualization || {})
            },
            filters: newInsightPayload.filters,
            dateConfig: newInsightPayload.dateConfig
          },
          title: newInsightPayload.name,
          layout: { w: 6 },
          projectId
        });

        if (widgetErr) {
          setError(widgetErr);
          toast.error(widgetErr || 'Could not add insight to dashboard.');
          setSubmitting(false);
          return;
        }
      }

      toast.success(`Added "${itemTitle}" to dashboard.`);
      onSuccess?.(targetDashboardId);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'An unexpected error occurred.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = insightName || newInsightPayload?.name || 'Insight';

  return (
    <DashboardDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Add to dashboard"
      description={`Add "${displayName}" to a dashboard in this workspace.`}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {error && (
          <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!isCreatingNew ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Select Dashboard
              </label>
              <button
                type="button"
                onClick={() => setIsCreatingNew(true)}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                + New dashboard
              </button>
            </div>

            {dashboards.length > 5 && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dashboards..."
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              />
            )}

            {loading ? (
              <div className="space-y-2 py-4">
                <div className="h-8 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-8 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ) : filteredDashboards.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                {dashboards.length === 0
                  ? 'No dashboards exist yet in this project.'
                  : 'No dashboards match your search.'}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(true)}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Create a new dashboard
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {filteredDashboards.map((dash) => {
                  const isSelected = selectedDashboardId === dash.id;
                  return (
                    <div
                      key={dash.id}
                      onClick={() => setSelectedDashboardId(dash.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs transition ${
                        isSelected
                          ? 'border-blue-500/40 bg-blue-50/50 text-blue-900 shadow-sm dark:border-blue-500/50 dark:bg-blue-950/30 dark:text-blue-200'
                          : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-850'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{dash.name}</div>
                        {dash.description && (
                          <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {dash.description}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-mono text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          {dash.widgetsCount ?? 0} widgets
                        </span>
                        <input
                          type="radio"
                          name="selectedDashboard"
                          checked={isSelected}
                          onChange={() => setSelectedDashboardId(dash.id)}
                          className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                New Dashboard Name
              </label>
              {dashboards.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs font-semibold text-neutral-500 hover:underline dark:text-neutral-400"
                >
                  Choose existing
                </button>
              )}
            </div>
            <input
              type="text"
              value={newDashboardName}
              onChange={(e) => setNewDashboardName(e.target.value)}
              placeholder="e.g., Product Health, Growth Metrics"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              autoFocus
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || (isCreatingNew ? !newDashboardName.trim() : !selectedDashboardId)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add to dashboard'}
          </button>
        </div>
      </div>
    </DashboardDialog>
  );
}

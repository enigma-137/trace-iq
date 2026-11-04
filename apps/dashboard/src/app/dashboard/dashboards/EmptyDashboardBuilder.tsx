'use client';

import { useState } from 'react';
import Link from 'next/link';
import { withProjectId } from '../nav';
import { addDashboardWidget, createInsight } from '@/lib/analytics-api';
import type { DashboardWidgetView, InsightType, VisualizationType } from '@/types/analytics';
import { InsightTypeIcon } from '@/components/insights/InsightTypeIcon';
import { toast } from '@/lib/toast';

export interface EmptyDashboardBuilderProps {
  dashboardId: string;
  projectId?: string;
  onAddExistingChart: () => void;
  onWidgetAdded: (widget: DashboardWidgetView) => void;
}

interface StarterChart {
  id: string;
  title: string;
  description: string;
  insightType: InsightType;
  chartType: VisualizationType;
  query: Record<string, unknown>;
}

const STARTER_CHARTS: StarterChart[] = [
  {
    id: 'daily-events',
    title: 'Daily events',
    description: 'Total event volume per day, last 7 days',
    insightType: 'trend',
    chartType: 'bar',
    query: { event: '*', measure: 'count', interval: 'day', days: '7' }
  },
  {
    id: 'active-users',
    title: 'Daily active users',
    description: 'Unique users per day, last 30 days',
    insightType: 'trend',
    chartType: 'line',
    query: { event: '*', measure: 'unique', interval: 'day', days: '30' }
  },
  {
    id: 'top-events',
    title: 'Top events',
    description: 'Most common events, last 14 days',
    insightType: 'event_breakdown',
    chartType: 'donut',
    query: { event: '*', breakdown: '$event_name', days: '14' }
  },
  {
    id: 'top-paths',
    title: 'Top paths',
    description: 'Most visited paths, last 30 days',
    insightType: 'event_breakdown',
    chartType: 'bar',
    query: { event: '*', breakdown: '$path', days: '30' }
  }
];

export function EmptyDashboardBuilder({
  dashboardId,
  projectId,
  onAddExistingChart,
  onWidgetAdded
}: EmptyDashboardBuilderProps) {
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleAddStarter(chart: StarterChart) {
    setAddingId(chart.id);
    const { data: insightData, error: insightError } = await createInsight({
      name: chart.title,
      description: chart.description,
      type: chart.insightType,
      query: chart.query,
      visualization: { chartType: chart.chartType },
      projectId
    });

    if (insightError || !insightData?.insight?.id) {
      toast.error(insightError || 'Failed to create insight');
      setAddingId(null);
      return;
    }

    const { data: widgetData, error: widgetError } = await addDashboardWidget(dashboardId, {
      insightId: insightData.insight.id,
      title: chart.title,
      layout: { w: 6 },
      projectId
    });

    setAddingId(null);
    if (widgetError || !widgetData?.widget) {
      toast.error(widgetError || 'Failed to add chart');
      return;
    }

    toast.success(`Added "${chart.title}" to the dashboard`);
    onWidgetAdded(widgetData.widget);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 py-10">
      <div className="text-center">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">This dashboard has no charts yet</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Add an insight you have already saved, or create a new one.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onAddExistingChart}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
          >
            Add a saved insight
          </button>
          <Link
            href={withProjectId(`/dashboard/insights/new?dashboardId=${dashboardId}`, projectId)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Create an insight
          </Link>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Or add a starter chart</h3>
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {STARTER_CHARTS.map((chart) => (
            <li key={chart.id}>
              <button
                type="button"
                onClick={() => handleAddStarter(chart)}
                disabled={addingId !== null}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition hover:bg-neutral-50 disabled:opacity-60 dark:hover:bg-neutral-800/50"
              >
                <InsightTypeIcon type={chart.insightType} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-900 dark:text-white">{chart.title}</span>
                  <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    {chart.description}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-neutral-500 dark:text-neutral-400">
                  {addingId === chart.id ? 'Adding...' : 'Add'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

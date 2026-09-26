'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { withProjectId } from '../nav';
import {
  createInsight,
  updateInsight,
  duplicateInsight,
  executeInsightQuery,
  fetchInsight,
  fetchEventNames,
  fetchEventProperties
} from '@/lib/analytics-api';
import type {
  SavedInsightView,
  InsightType,
  VisualizationType,
  InsightVisualizationConfig,
  InsightDateConfig
} from '@/types/analytics';
import { InsightChartRenderer } from '@/components/charts/InsightChartRenderer';
import { AddToDashboardModal } from '@/components/dashboards/AddToDashboardModal';
import { toast } from '@/lib/toast';

interface InsightBuilderProps {
  projectId?: string;
  initialInsight?: SavedInsightView | null;
  insightId?: string;
  // Optional return dashboard ID if opened from dashboard
  returnDashboardId?: string;
}

const VISUALIZATIONS: Array<{ id: VisualizationType; label: string; icon: string }> = [
  { id: 'line', label: 'Line', icon: 'M4 19L9 14L14 17L20 7' },
  { id: 'area', label: 'Area', icon: 'M4 19L9 14L14 17L20 7v12H4z' },
  { id: 'bar', label: 'Bar', icon: 'M4 20h16M7 20V10m5 10V4m5 10V8' },
  { id: 'donut', label: 'Donut', icon: 'M11 3.055A9 9 0 1020.945 13H11V3.055z' },
  { id: 'kpi', label: 'KPI', icon: 'M7 7h10v10H7z' },
  { id: 'table', label: 'Table', icon: 'M3 10h18M3 14h18M3 6h18v12H3z' }
];

export function InsightBuilder({
  projectId,
  initialInsight = null,
  insightId,
  returnDashboardId
}: InsightBuilderProps) {
  const router = useRouter();

  // Core metadata state
  const [name, setName] = useState(initialInsight?.name || 'Untitled Insight');
  const [description, setDescription] = useState(initialInsight?.description || '');
  const [type, setType] = useState<InsightType>(initialInsight?.type || 'trend');
  const [chartType, setChartType] = useState<VisualizationType>(
    (initialInsight?.visualization?.chartType as VisualizationType) || 'line'
  );

  // Query configuration state
  const [event, setEvent] = useState(initialInsight?.query?.event || '*');
  const [measure, setMeasure] = useState(initialInsight?.query?.measure || 'count');
  const [property, setProperty] = useState(initialInsight?.query?.property || '');
  const [breakdown, setBreakdown] = useState(initialInsight?.query?.breakdown || '');
  const [days, setDays] = useState(initialInsight?.dateConfig?.days || initialInsight?.query?.days || '30');
  const [interval, setInterval] = useState<'hour' | 'day' | 'week'>(
    initialInsight?.dateConfig?.interval || initialInsight?.query?.interval || 'day'
  );
  const [compare, setCompare] = useState(Boolean(initialInsight?.dateConfig?.compare ?? true));

  // Dynamic project telemetry schemas
  const [availableEvents, setAvailableEvents] = useState<Array<{ eventName: string; total: number; actors: number }>>([]);
  const [availableProperties, setAvailableProperties] = useState<Array<{ key: string; sampleType: string }>>([]);

  // Funnel steps state (when type === 'funnel')
  const [funnelSteps, setFunnelSteps] = useState<string[]>(
    initialInsight?.query?.steps || ['$pageview', '$click', 'letter_published']
  );

  // Live query execution & data state
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal states
  const [isAddToDashboardOpen, setIsAddToDashboardOpen] = useState(false);
  const [savedInsightId, setSavedInsightId] = useState<string | null>(initialInsight?.id || insightId || null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load project events
  useEffect(() => {
    fetchEventNames(projectId).then(({ data }) => {
      if (data?.eventNames) {
        setAvailableEvents(data.eventNames);
      }
    });
  }, [projectId]);

  // Load properties when event changes
  useEffect(() => {
    fetchEventProperties(event, projectId).then(({ data }) => {
      if (data?.properties) {
        setAvailableProperties(data.properties);
      }
    });
  }, [event, projectId]);

  // Run reactive query on config change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      runQuery();
    }, 200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [type, event, measure, property, breakdown, days, interval, compare, funnelSteps, chartType]);

  async function runQuery() {
    setIsQuerying(true);
    setQueryError(null);

    const queryPayload: Record<string, any> = {
      event,
      measure,
      property: property || undefined,
      breakdown: breakdown || undefined,
      days,
      interval,
      steps: type === 'funnel' ? funnelSteps : undefined
    };

    const dateConfig: InsightDateConfig = {
      days,
      interval,
      compare
    };

    const { data, error } = await executeInsightQuery({
      type,
      query: queryPayload,
      visualization: { chartType },
      dateConfig,
      projectId
    });

    setIsQuerying(false);
    if (error) {
      setQueryError(error);
    } else if (data) {
      setQueryResult(data.data !== undefined ? data.data : data.result !== undefined ? data.result : data);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Please specify an insight name');
      return;
    }

    setIsSaving(true);
    const queryPayload: Record<string, any> = {
      event,
      measure,
      property: property || undefined,
      breakdown: breakdown || undefined,
      days,
      interval,
      steps: type === 'funnel' ? funnelSteps : undefined
    };

    const visualizationPayload: InsightVisualizationConfig = {
      chartType
    };

    const dateConfigPayload: InsightDateConfig = {
      days,
      interval,
      compare
    };

    if (savedInsightId) {
      const { data, error } = await updateInsight(savedInsightId, {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        query: queryPayload,
        visualization: visualizationPayload,
        dateConfig: dateConfigPayload,
        projectId
      });

      setIsSaving(false);
      if (error) {
        toast.error(error);
      } else if (data?.insight) {
        toast.success('Insight updated');
        if (returnDashboardId) {
          router.push(withProjectId(`/dashboard/dashboards/${returnDashboardId}`, projectId));
        }
      }
    } else {
      const { data, error } = await createInsight({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        query: queryPayload,
        visualization: visualizationPayload,
        dateConfig: dateConfigPayload,
        projectId
      });

      setIsSaving(false);
      if (error) {
        toast.error(error);
      } else if (data?.insight) {
        toast.success('Insight saved');
        setSavedInsightId(data.insight.id);
        if (returnDashboardId) {
          router.push(withProjectId(`/dashboard/dashboards/${returnDashboardId}`, projectId));
        } else {
          router.replace(withProjectId(`/dashboard/insights/${data.insight.id}`, projectId));
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={withProjectId('/dashboard/insights', projectId)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
            >
              ← Insights
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Insight name..."
              className="rounded bg-transparent px-1.5 py-0.5 text-base font-semibold text-neutral-900 hover:bg-neutral-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white dark:hover:bg-neutral-850 dark:focus:bg-neutral-900"
            />
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for this chart..."
            className="w-full max-w-lg rounded bg-transparent px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-neutral-400 dark:hover:bg-neutral-850 dark:focus:bg-neutral-900"
          />
        </div>

        <div className="flex items-center gap-2">
          {savedInsightId && (
            <button
              type="button"
              onClick={() => setIsAddToDashboardOpen(true)}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              + Add to dashboard
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : savedInsightId ? 'Save changes' : 'Save insight'}
          </button>
        </div>
      </div>

      {/* Main Split-Screen Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Controls Panel (Cloudflare-style compact cards) */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Query Configuration
            </h3>

            <div className="space-y-3.5 text-xs">
              {/* Analysis Type */}
              <div>
                <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Analysis Type</label>
                <select
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value as InsightType;
                    setType(newType);
                    if (newType === 'funnel') setChartType('funnel');
                    else if (newType === 'retention') setChartType('retention');
                    else if (newType === 'kpi') setChartType('kpi');
                    else if (newType === 'table') setChartType('table');
                  }}
                  className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                >
                  <option value="trend">Trend (Time-series)</option>
                  <option value="kpi">KPI Metric</option>
                  <option value="funnel">Funnel Analysis</option>
                  <option value="retention">User Retention</option>
                  <option value="event_breakdown">Event Breakdown</option>
                  <option value="web_analytics">Web Traffic</option>
                  <option value="error_metric">Errors</option>
                  <option value="api_performance">API Latency</option>
                  <option value="table">Data Table</option>
                </select>
              </div>

              {/* Event / Action */}
              {type !== 'funnel' && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="font-medium text-neutral-700 dark:text-neutral-300">Event / Metric</label>
                    {availableEvents.length > 0 && (
                      <span className="text-[10px] text-neutral-400">
                        {availableEvents.length} events in project
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    list="project-events-list"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    placeholder="* (All Events), letter_published, $pageview..."
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 font-mono text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  />
                  <datalist id="project-events-list">
                    <option value="*" label="* (All Events)" />
                    {availableEvents.map((e) => (
                      <option key={e.eventName} value={e.eventName} label={`${e.eventName} (${e.total} events)`} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* Measure */}
              {type !== 'funnel' && type !== 'retention' && (
                <div>
                  <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Measure</label>
                  <select
                    value={measure}
                    onChange={(e) => setMeasure(e.target.value)}
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  >
                    <option value="count">Total events (Count)</option>
                    <option value="unique">Unique users</option>
                    <option value="avg">Average value</option>
                    <option value="sum">Sum of value</option>
                  </select>
                </div>
              )}

              {/* Property (for avg / sum) */}
              {(measure === 'avg' || measure === 'sum') && (
                <div>
                  <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Property</label>
                  <input
                    type="text"
                    list="project-properties-list"
                    value={property}
                    onChange={(e) => setProperty(e.target.value)}
                    placeholder="e.g., duration_ms, amount, score"
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 font-mono text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  />
                  <datalist id="project-properties-list">
                    {availableProperties.map((p) => (
                      <option key={p.key} value={p.key} label={`${p.key} (${p.sampleType})`} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* Breakdown by */}
              {type !== 'funnel' && type !== 'retention' && (
                <div>
                  <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Breakdown By</label>
                  <input
                    type="text"
                    list="project-breakdown-list"
                    value={breakdown}
                    onChange={(e) => setBreakdown(e.target.value)}
                    placeholder="e.g., $event_name, $os, $browser, $device"
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 font-mono text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  />
                  <datalist id="project-breakdown-list">
                    <option value="$event_name" label="Event Name ($event_name)" />
                    <option value="$os" label="Operating System ($os)" />
                    <option value="$browser" label="Browser ($browser)" />
                    <option value="$device" label="Device Type ($device)" />
                    <option value="$country" label="Country ($country)" />
                    <option value="$path" label="Page Path ($path)" />
                    {availableProperties.map((p) => (
                      <option key={p.key} value={p.key} label={`Property: ${p.key}`} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* Date Range & Interval */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Date Range</label>
                  <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  >
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-neutral-700 dark:text-neutral-300">Interval</label>
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value as any)}
                    className="w-full rounded border border-neutral-200 bg-neutral-50/50 p-2 text-neutral-800 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-200"
                  >
                    <option value="hour">Hourly</option>
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                  </select>
                </div>
              </div>

              {/* Compare toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="compare-check"
                  checked={compare}
                  onChange={(e) => setCompare(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="compare-check" className="cursor-pointer select-none text-neutral-700 dark:text-neutral-300">
                  Compare with previous period
                </label>
              </div>
            </div>
          </div>

          {/* Visualization Picker */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Visualization
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {VISUALIZATIONS.map((vis) => {
                const isSelected = chartType === vis.id;
                return (
                  <button
                    key={vis.id}
                    type="button"
                    onClick={() => setChartType(vis.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-xs transition ${
                      isSelected
                        ? 'border-blue-500/50 bg-blue-50/80 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-neutral-200 bg-neutral-50/40 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-850/40 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={vis.icon} />
                    </svg>
                    <span>{vis.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Live Preview Panel */}
        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-4 flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{name}</h2>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>{days}d window</span>
                  <span>•</span>
                  <span>{interval} intervals</span>
                  {breakdown && (
                    <>
                      <span>•</span>
                      <span>by {breakdown}</span>
                    </>
                  )}
                </div>
              </div>

              {isQuerying && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <div className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
                  Calculating...
                </div>
              )}
            </div>

            {/* Live Chart Renderer */}
            <div className="min-h-[320px] w-full">
              <InsightChartRenderer
                type={type}
                visualization={{ chartType }}
                data={queryResult}
                loading={isQuerying && !queryResult}
                error={queryError}
                onRetry={runQuery}
                height={320}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add To Dashboard Modal */}
      {isAddToDashboardOpen && savedInsightId && (
        <AddToDashboardModal
          isOpen={isAddToDashboardOpen}
          onClose={() => setIsAddToDashboardOpen(false)}
          projectId={projectId}
          insightId={savedInsightId}
          insightName={name}
        />
      )}
    </div>
  );
}

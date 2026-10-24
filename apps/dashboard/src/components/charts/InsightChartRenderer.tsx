'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { TrendChart } from './TrendChart';
import { BarChart } from './BarChart';
import { DonutChart } from './DonutChart';
import { FunnelChart } from './FunnelChart';
import type { InsightType, VisualizationType, InsightVisualizationConfig } from '../../types/analytics';
import { compactNumber } from '../../lib/metrics';

export interface InsightChartRendererProps {
  type?: InsightType;
  visualization?: InsightVisualizationConfig;
  data: any;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onConfigure?: () => void;
  className?: string;
  height?: number;
  projectId?: string;
  eventName?: string;
  propertyName?: string;
}

import { normalizeInsightData } from '../../lib/insightNormalization';
export { normalizeInsightData };

export function InsightChartRenderer({
  type = 'trend',
  visualization = {},
  data: rawData,
  loading = false,
  error = null,
  onRetry,
  onConfigure,
  className = '',
  height = 240,
  projectId,
  eventName,
  propertyName
}: InsightChartRendererProps) {
  // Skeleton loading state
  if (loading) {
    return (
      <div className={`flex w-full flex-col justify-center space-y-3 p-4 ${className}`} style={{ minHeight: height }}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800" />
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-200/50 dark:bg-neutral-850" />
        </div>
        <div className="flex flex-1 items-end gap-2 pt-4">
          {[40, 65, 30, 80, 55, 90, 75, 45, 60, 95].map((h, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t bg-neutral-200/60 dark:bg-neutral-800"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Contextual Empty State 1: Query failed
  if (error) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50/50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-900/30 ${className}`}
        style={{ minHeight: height }}
      >
        <div className="mb-2 text-rose-500">
          <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">Query failed</p>
        <p className="mt-1 max-w-sm text-[11px] text-neutral-500 dark:text-neutral-400">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const data = normalizeInsightData(rawData, type);

  // Contextual Empty State 2: Chart needs configuration (Funnel or unconfigured product metric)
  if (type === 'funnel' && (!data || !data.steps || data.steps.length === 0)) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50/30 p-6 text-center dark:border-neutral-800 dark:bg-neutral-900/20 ${className}`}
        style={{ minHeight: height }}
      >
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18l-6.5 8.5v6.5l-5-2.5v-4L3 4z" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-neutral-900 dark:text-white">This chart needs configuration</p>
        <p className="mt-1 max-w-xs text-[11px] text-neutral-500 dark:text-neutral-400">
          Choose the event(s) that represent this metric for your product.
        </p>
        {onConfigure && (
          <button
            type="button"
            onClick={onConfigure}
            className="mt-3 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
          >
            Configure
          </button>
        )}
      </div>
    );
  }

  // Contextual Empty State 3: API performance telemetry is not instrumented
  if (type === 'api_performance' && (!data || !data.summary || data.summary.totalRequests === 0)) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50/20 p-6 text-center dark:border-neutral-800 dark:bg-neutral-900/10 ${className}`}
        style={{ minHeight: height }}
      >
        <div className="mb-2 text-cyan-500 dark:text-cyan-400">
          <svg className="mx-auto h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">API performance telemetry is not instrumented</p>
        <p className="mt-1 max-w-xs text-[11px] text-neutral-500 dark:text-neutral-400">
          Capture endpoint latency and HTTP status using the TraceIQ backend SDK.
        </p>
        <Link
          href={`/dashboard/setup${projectId ? `?projectId=${projectId}` : ''}`}
          className="mt-3 inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          View setup guide
        </Link>
      </div>
    );
  }

  // Contextual Empty State 4: Selected property does not exist
  if (propertyName && propertyName.trim() && data && (!data.series || data.series.length === 0) && (!data.items || data.items.length === 0)) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 p-6 text-center text-xs dark:border-neutral-800 ${className}`}
        style={{ minHeight: height }}
      >
        <p className="font-semibold text-neutral-800 dark:text-neutral-200">Selected property does not exist</p>
        <p className="mt-1 max-w-xs text-[11px] text-neutral-500 dark:text-neutral-400">
          Property &quot;{propertyName}&quot; was not found in matching telemetry.
        </p>
        {onConfigure && (
          <button
            type="button"
            onClick={onConfigure}
            className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
          >
            Choose property
          </button>
        )}
      </div>
    );
  }

  // Check if data is completely missing or empty
  if (!data) {
    if (eventName && eventName !== '*' && eventName !== '$all') {
      return (
        <div
          className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 p-6 text-center text-xs dark:border-neutral-800 ${className}`}
          style={{ minHeight: height }}
        >
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">Selected event has no matching rows</p>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            No events named &quot;{eventName}&quot; were recorded in this project.
          </p>
          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
            >
              Choose event
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 p-6 text-center text-xs dark:border-neutral-800 ${className}`}
        style={{ minHeight: height }}
      >
        <p className="font-semibold text-neutral-800 dark:text-neutral-200">No telemetry in this date range</p>
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">Change date range to view earlier telemetry.</p>
      </div>
    );
  }

  const chartType = (visualization?.chartType ||
    visualization?.type ||
    (type === 'funnel'
      ? 'funnel'
      : type === 'retention'
        ? 'retention'
        : type === 'kpi'
          ? 'kpi'
          : type === 'table'
            ? 'table'
            : type === 'event_breakdown'
              ? 'bar'
              : 'line')) as VisualizationType;

  // 1. KPI / Number View
  if (chartType === 'kpi' || chartType === 'number') {
    let rawValue = data.value;
    if (rawValue === undefined) {
      if (typeof data.current === 'number') {
        rawValue = data.current;
      } else if (data.current && typeof data.current === 'object') {
        rawValue = data.current.visitors ?? data.current.pageviews ?? data.current.total ?? data.current.count ?? data.current.value;
      }
    }
    if (rawValue === undefined) {
      if (typeof data.summary?.current === 'number') {
        rawValue = data.summary.current;
      } else if (data.summary?.current && typeof data.summary.current === 'object') {
        rawValue = data.summary.current.visitors ?? data.summary.current.pageviews ?? data.summary.current.total ?? data.summary.current.count;
      }
    }
    if (rawValue === undefined) {
      rawValue = data.totalRequests ?? data.summary?.totalRequests ?? data.totalVisitors ?? data.totalViews;
    }
    if (rawValue === undefined && Array.isArray(data.series)) {
      rawValue = data.series.reduce((sum: number, s: any) => {
        return sum + (s.points || []).reduce((acc: number, p: any) => acc + Number(p.value ?? p.total ?? 0), 0);
      }, 0);
    }
    if (rawValue === undefined && Array.isArray(data.items)) {
      rawValue = data.items.reduce((acc: number, i: any) => acc + Number(i.value ?? 0), 0);
    }
    if (rawValue === undefined && Array.isArray(data.issues)) {
      rawValue = data.issues.reduce((acc: number, i: any) => acc + Number(i.occurrences ?? 0), 0);
    }
    const value = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? rawValue : 0;

    const rawPrev = data.previous ?? data.summary?.previous;
    const previous =
      typeof rawPrev === 'number'
        ? rawPrev
        : rawPrev && typeof rawPrev === 'object'
          ? (rawPrev.visitors ?? rawPrev.pageviews ?? rawPrev.total ?? rawPrev.count ?? rawPrev.value)
          : undefined;

    const label = data.label || visualization?.unit || (data.series?.length === 1 ? data.series[0].key : '');
    let delta = 0;
    let deltaFormatted = '';
    if (typeof value === 'number' && typeof previous === 'number' && previous > 0) {
      delta = ((value - previous) / previous) * 100;
      deltaFormatted = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
    }

    return (
      <div className={`flex w-full flex-col justify-center p-4 ${className}`} style={{ minHeight: height }}>
        <div className="flex items-baseline gap-3">
          <div className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {typeof value === 'number' ? compactNumber(value) : String(value ?? 0)}
          </div>
          {deltaFormatted && (
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                delta >= 0
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              {deltaFormatted}
            </span>
          )}
        </div>
        {label && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{label}</div>}
        {typeof previous === 'number' && (
          <div className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
            vs {compactNumber(previous)} in previous period
          </div>
        )}
      </div>
    );
  }

  // 2. Funnel View
  if (chartType === 'funnel' || type === 'funnel') {
    const steps = data.steps || [];
    if (steps.length === 0) {
      return (
        <div className="flex items-center justify-center p-6 text-xs text-neutral-400" style={{ minHeight: height }}>
          No funnel steps defined
        </div>
      );
    }
    return (
      <div className={`w-full overflow-x-auto p-2 ${className}`}>
        <FunnelChart steps={steps} />
      </div>
    );
  }

  // 3. Retention View
  if (chartType === 'retention' || type === 'retention') {
    const cohorts = data.cohorts || data.matrix || [];
    if (cohorts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400" style={{ minHeight: height }}>
          <p className="font-medium text-neutral-700 dark:text-neutral-300">No cohort retention data yet</p>
          <p className="mt-1 text-[11px] text-neutral-500">Requires activity across multiple consecutive weeks.</p>
        </div>
      );
    }
    return (
      <div className={`w-full overflow-x-auto p-2 ${className}`}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <th className="py-2 pr-4 font-medium">Cohort</th>
              <th className="py-2 pr-4 font-medium">Users</th>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i} className="py-2 px-2 text-center font-medium">
                  {i === 0 ? 'Week 0' : `+${i}w`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-850">
            {cohorts.map((row: any, rIdx: number) => (
              <tr key={rIdx}>
                <td className="py-2 pr-4 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">{row.cohort || `Cohort ${rIdx + 1}`}</td>
                <td className="py-2 pr-4 font-mono text-[11px] text-neutral-500">{row.size || row.users || 0}</td>
                {(row.rates || row.values || []).slice(0, 8).map((rate: number, cIdx: number) => {
                  const pct = Math.round(rate * 100);
                  const bgOpacity = Math.max(0.08, rate * 0.9);
                  return (
                    <td key={cIdx} className="p-1 text-center font-mono text-[10px]">
                      <div
                        className="rounded py-1 font-medium text-neutral-900 dark:text-white"
                        style={{ backgroundColor: `rgba(59, 130, 246, ${bgOpacity})` }}
                      >
                        {pct}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 4. Table View
  if (chartType === 'table' || type === 'table' || type === 'error_metric') {
    let rows: any[] = [];
    let columns: string[] = [];

    if (Array.isArray(data.issues)) {
      rows = data.issues;
      columns = ['title', 'occurrences', 'affectedUsers', 'lastSeen'];
    } else if (Array.isArray(data.rows)) {
      rows = data.rows;
      columns = data.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);
    } else if (Array.isArray(data.items)) {
      const grandTotal = data.items.reduce((acc: number, i: any) => acc + (i.value || 0), 0) || 1;
      rows = data.items.map((i: any) => ({
        Dimension: i.label,
        Count: i.value,
        Share: `${((i.value / grandTotal) * 100).toFixed(1)}%`
      }));
      columns = ['Dimension', 'Count', 'Share'];
    } else if (Array.isArray(data.series)) {
      if (data.series.length > 1) {
        const grandTotal = data.series.reduce((sum: number, s: any) => {
          return sum + (s.points || []).reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0);
        }, 0) || 1;
        rows = data.series
          .map((s: any) => {
            const count = (s.points || []).reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0);
            return {
              Segment: s.key,
              Events: count,
              Share: `${((count / grandTotal) * 100).toFixed(1)}%`
            };
          })
          .sort((a: any, b: any) => b.Events - a.Events);
        columns = ['Segment', 'Events', 'Share'];
      } else if (data.series.length === 1 && data.series[0]?.points) {
        rows = data.series[0].points.map((p: any) => ({
          Interval: p.bucket,
          Events: p.value || p.total || 0
        }));
        columns = ['Interval', 'Events'];
      }
    }

    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400" style={{ minHeight: height }}>
          <p className="font-medium text-neutral-700 dark:text-neutral-300">No records found for this period</p>
        </div>
      );
    }

    return (
      <div className={`w-full overflow-x-auto ${className}`}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/70 text-[11px] font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-850/50 dark:text-neutral-400">
              {columns.map((col: string) => (
                <th key={col} className="px-3 py-2 font-medium capitalize">
                  {col.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {rows.slice(0, 50).map((row: any, rIdx: number) => (
              <tr key={rIdx} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-850/30">
                {columns.map((col: string) => {
                  const val = row[col];
                  return (
                    <td key={col} className="px-3 py-2 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                      {typeof val === 'number' ? val.toLocaleString() : typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 5. Pie / Donut View
  if (chartType === 'donut' || chartType === 'pie') {
    let items: Array<{ label: string; value: number }> = [];
    if (Array.isArray(data.items)) {
      items = data.items;
    } else if (Array.isArray(data.series)) {
      if (data.series.length > 1) {
        items = data.series
          .map((s: any) => ({
            label: s.key,
            value: s.points.reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0)
          }))
          .filter((i: any) => i.value > 0);
      } else if (data.series.length === 1 && data.series[0]?.points) {
        items = data.series[0].points
          .map((p: any) => ({
            label: p.bucket,
            value: p.value || p.total || 0
          }))
          .filter((i: any) => i.value > 0);
      }
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400" style={{ minHeight: height }}>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200">No dimension data recorded</p>
          <p className="mt-1 text-[11px] text-neutral-500">Capture device and client context with events.</p>
        </div>
      );
    }

    return (
      <div className={`flex w-full items-center justify-center p-2 ${className}`}>
        <DonutChart items={items} size={Math.min(height, 220)} />
      </div>
    );
  }

  // 6. Bar View
  if (chartType === 'bar') {
    let items: Array<{ label: string; value: number }> = [];
    if (Array.isArray(data.items)) {
      items = data.items;
    } else if (Array.isArray(data.series)) {
      if (data.series.length > 1) {
        items = data.series
          .map((s: any) => ({
            label: s.key,
            value: s.points.reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0)
          }))
          .filter((i: any) => i.value > 0)
          .sort((a: any, b: any) => b.value - a.value);
      } else if (data.series.length === 1 && data.series[0]?.points) {
        items = data.series[0].points
          .map((p: any) => ({
            label: p.bucket,
            value: p.value || p.total || 0
          }))
          .filter((i: any) => i.value > 0);
      }
    }

    if (items.length > 0) {
      return (
        <div className={`w-full p-2 ${className}`}>
          <BarChart items={items} height={height} showValues />
        </div>
      );
    }
  }

  // 7. Area Chart
  if (chartType === 'area') {
    if (data.buckets && data.series && data.series.length > 0) {
      const totalPoints = data.series.reduce((sum: number, s: any) => sum + (s.points || []).reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0), 0);
      if (totalPoints > 0) {
        return (
          <div className={`w-full ${className}`}>
            <AreaChart buckets={data.buckets} series={data.series} interval={data.interval || 'day'} height={height} />
          </div>
        );
      }
    }
  }

  // 8. Line / Trend Chart (Default)
  if (data.buckets && data.series && data.series.length > 0) {
    const buckets: string[] = data.buckets;
    const series = data.series;
    const interval = data.interval || 'day';
    const totalPoints = series.reduce((sum: number, s: any) => sum + (s.points || []).reduce((acc: number, p: any) => acc + (p.value || p.total || 0), 0), 0);

    if (totalPoints > 0) {
      return (
        <div className={`w-full ${className}`}>
          <TrendChart buckets={buckets} series={series} interval={interval} />
        </div>
      );
    }
  }

  // Fallback if items array exists
  if (Array.isArray(data.items) && data.items.length > 0) {
    return (
      <div className={`w-full p-2 ${className}`}>
        <BarChart items={data.items} height={height} showValues />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400" style={{ minHeight: height }}>
      <p className="font-semibold text-neutral-800 dark:text-neutral-200">No telemetry in this date range</p>
      <p className="mt-1 text-[11px] text-neutral-500">Change date range to view earlier telemetry.</p>
    </div>
  );
}

// Area Chart helper component
function AreaChart({
  series,
  height = 240
}: {
  buckets: string[];
  series: Array<{ key: string; points: Array<{ bucket: string; value: number }> }>;
  interval: string;
  height?: number;
}) {
  const uid = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const primarySeries = series[0] || { points: [] };
  const points = primarySeries.points || [];

  if (points.length === 0) {
    return <div className="flex h-44 items-center justify-center text-xs text-neutral-400">No data points</div>;
  }

  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const width = 640;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxY = Math.max(1, ...points.map((p) => p.value));

  const xFor = (idx: number) => pad.left + (idx / Math.max(1, points.length - 1)) * plotW;
  const yFor = (val: number) => pad.top + plotH - (val / maxY) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${xFor(points.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Gridlines */}
        {[0, maxY / 2, maxY].map((val, i) => {
          const y = yFor(val);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="currentColor" strokeOpacity="0.08" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" className="fill-neutral-400 text-[10px] font-mono">
                {compactNumber(val)}
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <path d={areaD} fill={`url(#grad-${uid})`} />

        {/* Line stroke */}
        <path d={pathD} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points & hover listener */}
        {points.map((p, i) => {
          const cx = xFor(i);
          const cy = yFor(p.value);
          const isHover = hoverIndex === i;
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={isHover ? 5 : 3}
                className="fill-blue-500 stroke-white dark:stroke-neutral-900"
                strokeWidth="1.5"
              />
              <rect
                x={cx - plotW / (points.length * 2)}
                y={pad.top}
                width={plotW / points.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                className="cursor-pointer"
              />
            </g>
          );
        })}

        {/* X labels */}
        {points.filter((_, i) => i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1).map((p, i) => {
          const origIdx = points.indexOf(p);
          const cx = xFor(origIdx);
          const anchor = origIdx === 0 ? 'start' : origIdx === points.length - 1 ? 'end' : 'middle';
          let label = p.bucket;
          if (/^\d{4}-\d{2}-\d{2}/.test(label) || (!Number.isNaN(Date.parse(label)) && label.includes('-'))) {
            const d = new Date(label);
            if (!Number.isNaN(d.getTime())) {
              label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
            }
          }
          return (
            <text
              key={i}
              x={cx}
              y={height - 8}
              textAnchor={anchor}
              className="fill-neutral-400 text-[10px] font-mono"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

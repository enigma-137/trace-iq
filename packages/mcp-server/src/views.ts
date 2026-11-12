import { JsonObject } from './types.js';

/**
 * Turns a tool's API response into the small view model the MCP Apps widget draws
 * (widget.ts). Returned in structuredContent._view. Null when the response is not
 * the shape we expect, so the widget simply shows nothing to chart.
 */

export type Tone = 'good' | 'warning' | 'critical' | 'neutral';

export interface View {
  title: string;
  subtitle?: string;
  status?: { tone: Tone; label: string };
  stats?: { label: string; value: string; delta?: { text: string; good: boolean | null } }[];
  series?: { label: string; points: { x: string; y: number; label?: string }[] };
  bars?: { label: string; max?: number; rows: { label: string; value: number; display: string; note?: string; highlight?: boolean }[] };
  notes?: string[];
}

type Rec = Record<string, unknown>;
const obj = (value: unknown): Rec | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const rows = (value: unknown): Rec[] => (Array.isArray(value) ? value.map(obj).filter((row): row is Rec => row !== null) : []);

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('en-US'),
  pct: (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits).replace(/\.0+$/, '')}%`,
  window: (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`)
};

function bucketLabel(bucket: string, interval: string): string {
  const date = bucket.slice(0, 10);
  return interval === 'hour' ? `${date.slice(5)} ${bucket.slice(11, 16)}` : date;
}

function healthView(result: unknown): View | null {
  const health = obj(result);
  const failures = obj(health?.failures);
  if (!health || !failures || !str(health.status)) return null;
  const tones: Record<string, Tone> = { operational: 'good', degraded: 'warning', outage: 'critical', idle: 'neutral' };
  const labels: Record<string, string> = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', idle: 'No traffic' };
  const status = health.status as string;
  const project = obj(health.project);
  const minutes = num(health.windowMinutes) ?? 60;

  const notes: string[] = [];
  const topError = obj(failures.topError);
  if (topError) notes.push(`Top error: ${str(topError.type) ?? 'Error'}: ${str(topError.message) ?? ''} (${fmt.int(num(topError.count) ?? 0)}×)`);
  const topRequest = obj(failures.topFailedRequest);
  if (topRequest) {
    notes.push(`Top failing request: ${str(topRequest.method) ?? ''} ${str(topRequest.path) ?? ''} → ${num(topRequest.status) ?? ''} (${fmt.int(num(topRequest.count) ?? 0)}×)`);
  }
  if (str(failures.recoveredAt)) notes.push(`Recovered at ${new Date(failures.recoveredAt as string).toUTCString()}`);

  const total = num(failures.totalRequests) ?? 0;
  const failed = num(failures.failedRequests) ?? 0;
  return {
    title: `${str(project?.name) ?? 'Project'} health`,
    subtitle: `${str(health.summary) ?? ''} · last ${fmt.window(minutes)}`,
    status: { tone: tones[status] ?? 'neutral', label: labels[status] ?? status },
    stats: [
      { label: 'Requests', value: fmt.int(total) },
      { label: 'Failed requests', value: fmt.int(failed), delta: total ? { text: `${fmt.pct(failed / total)} of requests`, good: failed === 0 } : undefined },
      { label: 'Exceptions', value: fmt.int(num(failures.exceptions) ?? 0) },
      { label: 'Users affected', value: fmt.int(num(failures.affectedUsers) ?? 0) }
    ],
    notes
  };
}

function trendsView(result: unknown): View | null {
  const trends = obj(result);
  const series = rows(trends?.series);
  if (!trends || !series.length) return null;
  const interval = str(trends.interval) ?? 'day';
  const measure = str(trends.measure) ?? 'count';
  const event = str(trends.event);
  const what = `${event === '*' || !event ? 'All events' : event}${measure === 'count' ? '' : ` (${measure}${str(trends.property) ? ` of ${trends.property}` : ''})`}`;
  const summary = obj(trends.summary);
  const current = num(summary?.current);
  const previous = num(summary?.previous);
  const stats: View['stats'] = [];
  if (current !== null) {
    const change = previous ? (current - previous) / previous : null;
    stats.push({
      label: `Last ${num(summary?.days) ?? ''} days`.replace('  ', ' '),
      value: fmt.int(current),
      delta: change === null ? undefined : { text: `${change >= 0 ? '+' : ''}${fmt.pct(change)} vs previous`, good: null }
    });
    if (previous !== null) stats.push({ label: 'Previous period', value: fmt.int(previous) });
  }

  const view: View = { title: what, subtitle: `By ${interval}${str(trends.breakdown) ? `, broken down by ${trends.breakdown}` : ''}`, stats };
  if (str(trends.breakdown)) {
    // Many lines in one small chart are unreadable; rank the breakdown values instead.
    const totals = series
      .map((entry) => ({ key: str(entry.key) ?? '(none)', total: rows(entry.points).reduce((sum, point) => sum + (num(point.value) ?? 0), 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
    view.bars = { label: `Total by ${trends.breakdown}`, rows: totals.map((entry) => ({ label: entry.key, value: entry.total, display: fmt.int(entry.total) })) };
  } else {
    const points = rows(series[0].points)
      .filter((point) => str(point.bucket))
      .map((point) => ({ x: bucketLabel(point.bucket as string, interval), y: num(point.value) ?? 0 }));
    view.series = { label: what, points: points.map((point) => ({ ...point, label: fmt.int(point.y) })) };
  }
  return view;
}

function funnelView(result: unknown): View | null {
  const data = obj(result);
  const steps = rows(data?.steps);
  if (!data || !steps.length) return null;
  const first = num(steps[0].count) ?? 0;
  const last = steps[steps.length - 1];
  let worst = -1;
  let worstRate = 2;
  steps.forEach((step, index) => {
    const rate = num(step.conversionFromPrevious) ?? 1;
    if (index > 0 && rate < worstRate) {
      worstRate = rate;
      worst = index;
    }
  });
  return {
    title: str(obj(data.funnel)?.name) ?? 'Funnel',
    subtitle: `Last ${num(data.days) ?? ''} days`.replace('  ', ' '),
    stats: [
      { label: 'Entered', value: fmt.int(first) },
      { label: 'Completed', value: fmt.int(num(last.count) ?? 0) },
      { label: 'Conversion', value: fmt.pct(num(last.conversionFromStart) ?? 0) }
    ],
    bars: {
      label: 'Users per step',
      max: first,
      rows: steps.map((step, index) => {
        const count = num(step.count) ?? 0;
        const dropped = num(step.droppedFromPrevious) ?? 0;
        return {
          label: `${index + 1}. ${str(step.label) ?? str(step.eventName) ?? 'Step'}`,
          value: count,
          display: `${fmt.int(count)} · ${fmt.pct(num(step.conversionFromStart) ?? 0)}`,
          note: index > 0 ? `${fmt.int(dropped)} dropped (${fmt.pct(1 - (num(step.conversionFromPrevious) ?? 1))} of the previous step)${index === worst ? ', the biggest drop' : ''}` : undefined,
          highlight: index === worst && worstRate < 1
        };
      })
    }
  };
}

function controlLabel(name: string, isControl: boolean): string {
  return isControl && !/control/i.test(name) ? `${name} (control)` : name;
}

function experimentView(result: unknown): View | null {
  const data = obj(result);
  const variants = rows(data?.variants);
  if (!data || !variants.length) return null;
  const winnerKey = str(data.recommendedWinner);
  const winner = variants.find((variant) => variant.variantKey === winnerKey);
  const status: View['status'] = winner
    ? { tone: 'good', label: `${str(winner.variantName) ?? winnerKey} is winning` }
    : data.hasEnoughData === false
      ? { tone: 'neutral', label: 'Not enough data yet' }
      : { tone: 'neutral', label: 'No significant winner yet' };

  return {
    title: 'Experiment results',
    subtitle: `Primary metric ${str(data.primaryMetric) ?? ''} · ${str(data.status) ?? ''}`,
    status,
    stats: [
      { label: 'Exposures', value: fmt.int(num(data.totalExposures) ?? 0) },
      { label: 'Conversions', value: fmt.int(num(data.totalConversions) ?? 0) },
      { label: 'Conversion rate', value: fmt.pct(num(data.overallConversionRate) ?? 0) }
    ],
    bars: {
      label: 'Conversion rate by variant',
      rows: variants.map((variant) => {
        const uplift = num(variant.uplift);
        const confidence = num(variant.confidence);
        return {
          label: controlLabel(str(variant.variantName) ?? str(variant.variantKey) ?? 'Variant', variant.isControl === true),
          value: num(variant.conversionRate) ?? 0,
          display: fmt.pct(num(variant.conversionRate) ?? 0),
          note: variant.isControl
            ? `${fmt.int(num(variant.exposures) ?? 0)} exposures`
            : `${uplift === null ? 'no lift yet' : `${uplift >= 0 ? '+' : ''}${uplift}% lift`}${confidence === null ? '' : ` · ${confidence}% confidence`}${variant.isSignificant ? ' · significant' : ''}`
        };
      })
    }
  };
}

const VIEWS: Record<string, (result: unknown, args: JsonObject) => View | null> = {
  get_project_health: healthView,
  get_trends: trendsView,
  get_funnel_results: funnelView,
  get_experiment_results: experimentView
};

/** Tools whose results the widget can draw. */
export const widgetTools = Object.keys(VIEWS);

export function buildView(toolName: string, args: JsonObject, result: unknown): View | null {
  try {
    return VIEWS[toolName]?.(result, args) ?? null;
  } catch {
    return null;
  }
}

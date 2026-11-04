import type { LogLevel, LogStatus } from './types';

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

export type StatusTone = 'ok' | 'warn' | 'error' | 'neutral';

/** "200 OK" for an HTTP entry, or a plain word for one without a status code. */
export function statusLabel(status: LogStatus, code?: number | null): { text: string; tone: StatusTone } {
  if (code) {
    const tone: StatusTone = code >= 500 ? 'error' : code >= 400 ? 'warn' : 'ok';
    const name = HTTP_STATUS_TEXT[code];
    return { text: name ? `${code} ${name}` : String(code), tone };
  }
  if (status === 'error') return { text: 'Failed', tone: 'error' };
  if (status === 'warning') return { text: 'Warning', tone: 'warn' };
  if (status === 'pending') return { text: 'Pending', tone: 'neutral' };
  if (status === 'info') return { text: 'Info', tone: 'neutral' };
  return { text: 'OK', tone: 'ok' };
}

export const SOURCE_LABELS: Record<string, string> = {
  api: 'API',
  webhook: 'Webhook',
  ai: 'AI',
  alert: 'Alert',
  error: 'Error',
  auth: 'Auth',
  job: 'Job',
  sdk: 'SDK',
  event: 'Event',
  custom: 'Custom'
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? (source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Log');
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** 2026-11-04 19:36:17.000, in the viewer's time zone; the full local string is the tooltip. */
export function formatLogTimestamp(ts: string): { text: string; full: string } {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { text: ts, full: ts };
  return {
    text: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`,
    full: d.toLocaleString()
  };
}

/** The coloured bar at the start of a row. */
export const LEVEL_BAR: Record<LogLevel, string> = {
  fatal: 'bg-rose-700',
  error: 'bg-rose-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500/70',
  debug: 'bg-neutral-300 dark:bg-slate-600'
};

export const LEVEL_TEXT: Record<LogLevel, string> = {
  fatal: 'text-rose-700 dark:text-rose-400',
  error: 'text-rose-600 dark:text-rose-400',
  warn: 'text-amber-600 dark:text-amber-400',
  info: 'text-neutral-500 dark:text-slate-400',
  debug: 'text-neutral-400 dark:text-slate-500'
};

/**
 * The top gridline: the smallest value at or above `value` that splits into four whole, round
 * steps (so the axis reads 100, 75, 50, 25, 0 rather than 83, 62.25, ...).
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 4) return 4;
  const step = value / 4;
  if (step <= 10) return 4 * ([1, 2, 3, 4, 5, 6, 8, 10].find((candidate) => candidate >= step) ?? 10);
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const multiple = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((candidate) => candidate * magnitude >= step) ?? 10;
  return 4 * magnitude * multiple;
}

/** Gridline values from the top down: four intervals, so the top is niceMax and the bottom is 0. */
export function yTicks(max: number): number[] {
  const top = niceMax(max);
  return [top, (top * 3) / 4, top / 2, top / 4, 0];
}

/** Compact axis number: 1,200 -> 1.2k. */
export function formatAxisNumber(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)}k`;
  return String(Number.isInteger(value) ? value : +value.toFixed(1));
}

/** Evenly spread bucket indexes for the x-axis labels, always including the first and last. */
export function xTickIndices(length: number, count = 5): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const indices = new Set<number>();
  for (let i = 0; i < count; i += 1) indices.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...indices];
}

/** "Nov 4, 18:40" for a bucket, with the year only when it is not this year. */
export function formatTick(ts: string, spanMs: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (spanMs <= 6 * 60 * 60 * 1000) return time;
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

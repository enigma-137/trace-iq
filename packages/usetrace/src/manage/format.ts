import { colors } from '../terminal/ui.js';
import type { ErrorIssue, LogEntry, RecentEvent } from './api-client.js';

/**
 * Parses a relative window such as `30s`, `15m`, `2h`, `7d` into milliseconds.
 * Returns undefined for anything else.
 */
export function parseDuration(value: string): number | undefined {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

/**
 * Resolves `--since` into an ISO timestamp: accepts a relative window
 * (`15m`) or anything `Date` can parse.
 */
export function resolveSince(value: string, now = Date.now()): string | undefined {
  const ms = parseDuration(value);
  if (ms !== undefined) return new Date(now - ms).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function colorLevel(level: string): string {
  const label = level.toUpperCase().padEnd(5);
  switch (level.toLowerCase()) {
    case 'error':
    case 'fatal':
      return colors.red(label);
    case 'warn':
    case 'warning':
      return colors.yellow(label);
    case 'debug':
    case 'trace':
      return colors.gray(label);
    default:
      return colors.cyan(label);
  }
}

/**
 * One log per line: time, level, source/service, request summary, message.
 */
export function formatLogLine(log: LogEntry): string {
  const parts = [colors.dim(formatTime(log.timestamp)), colorLevel(log.level || 'info')];

  const origin = log.service || log.source;
  if (origin) parts.push(colors.magenta(`[${origin}]`));

  if (log.method || log.route) {
    const request = [log.method, log.route].filter(Boolean).join(' ');
    const status = log.statusCode ? ` ${log.statusCode >= 500 ? colors.red(String(log.statusCode)) : log.statusCode >= 400 ? colors.yellow(String(log.statusCode)) : colors.green(String(log.statusCode))}` : '';
    const duration = log.durationMs != null ? colors.dim(` ${Math.round(log.durationMs)}ms`) : '';
    parts.push(`${request}${status}${duration}`);
  }

  parts.push(log.message);

  if (log.traceId) parts.push(colors.dim(`trace=${log.traceId}`));

  return parts.join(' ');
}

export function formatEventLine(event: RecentEvent): string {
  const who = event.externalUserId || (event.anonymousId ? `anon:${event.anonymousId.slice(0, 8)}` : '-');
  const props = event.properties ? summarizeProperties(event.properties) : '';
  return [
    colors.dim(formatTime(event.receivedAt)),
    colors.bold(colors.cyan(event.eventName)),
    colors.dim(who),
    props
  ]
    .filter(Boolean)
    .join(' ');
}

function summarizeProperties(properties: Record<string, unknown>, max = 4): string {
  const entries = Object.entries(properties).filter(([, value]) => value !== null && typeof value !== 'object');
  const shown = entries.slice(0, max).map(([key, value]) => {
    const text = String(value);
    return `${key}=${text.length > 40 ? `${text.slice(0, 37)}...` : text}`;
  });
  if (entries.length > max) shown.push(`+${entries.length - max} more`);
  return colors.gray(shown.join(' '));
}

export function formatErrorIssue(issue: ErrorIssue, now = Date.now()): string[] {
  const message = issue.message.length > 100 ? `${issue.message.slice(0, 97)}...` : issue.message;
  return [
    `${colors.red(colors.bold(issue.type))}: ${message}`,
    colors.dim(
      `  ${issue.occurrences} events · ${issue.users} users · last seen ${formatRelative(issue.lastSeen, now)} · first seen ${formatRelative(issue.firstSeen, now)}`
    )
  ];
}

/**
 * Renders rows as aligned columns. Widths are computed on the uncolored text.
 */
export function renderTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => stripAnsi(row[i] ?? '').length)));
  const pad = (cell: string, i: number) => cell + ' '.repeat(Math.max(widths[i] - stripAnsi(cell).length, 0));
  return [
    colors.dim(headers.map(pad).join('  ')),
    ...rows.map((row) => row.map(pad).join('  ').trimEnd())
  ];
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

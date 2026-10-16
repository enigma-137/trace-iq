import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { logsWindowQuery } from '../src/lib/recent-logs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Overview Recent logs panel', () => {
  it('queries the existing Logs API for the selected project over the last 24h', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z');
    const all = logsWindowQuery('proj_1', 'all', now);
    expect(all.get('projectId')).toBe('proj_1');
    expect(all.get('from')).toBe('2026-10-15T12:00:00.000Z');
    expect(all.get('to')).toBe('2026-10-16T12:00:00.000Z');
    expect(all.has('status')).toBe(false);
    expect(logsWindowQuery(null, 'problems', now).get('status')).toBe('error,warning');
  });

  it('reuses the Logs endpoints instead of new logging infrastructure', () => {
    const source = read('../src/app/dashboard/RecentLogsPanel.tsx');
    expect(source).toContain('logsWindowQuery');
    expect(source).toContain('/v1/dashboard/logs?');
    expect(source).toContain('/v1/dashboard/logs/histogram?');
    expect(source).toContain("from './logs/types'");
    expect(source).toContain('AbortController');
    expect(source).toContain("document.visibilityState === 'visible'");
  });

  it('shows severity, counts, the filter toggle, deep links and every state', () => {
    const source = read('../src/app/dashboard/RecentLogsPanel.tsx');
    for (const text of ['All logs', 'Errors & Warnings', 'View all logs', 'errors', 'warnings', 'Loading recent logs…', 'No logs in the last 24 hours.', 'Retry']) {
      expect(source).toContain(text);
    }
    expect(source).toContain('/dashboard/logs?logId=');
    expect(source).not.toMatch(/gradient|backdrop-blur|blur-|animate-|glow/);
  });

  it('sits under the trends chart, and the Logs page opens a deep-linked entry', () => {
    const page = read('../src/app/dashboard/page.tsx');
    const chart = page.indexOf('<OverviewTabbedChart');
    const panel = page.indexOf('<RecentLogsPanel');
    expect(chart).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(chart);
    expect(panel).toBeLessThan(page.indexOf('<NowActivityPanel'));

    const logsPage = read('../src/app/dashboard/logs/page.tsx');
    expect(logsPage).toContain('searchParams.logId');
    expect(logsPage).toContain('initialSelectedLog=');
  });
});

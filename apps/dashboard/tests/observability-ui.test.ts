import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Logs & Observability UI', () => {
  it('registers Logs in dashboard navigation with FlashIcon', () => {
    const navSource = readFileSync(
      new URL('../src/app/dashboard/nav.ts', import.meta.url),
      'utf8'
    );
    const iconSource = readFileSync(
      new URL('../src/app/dashboard/NavIcon.tsx', import.meta.url),
      'utf8'
    );

    expect(navSource).toContain("label: 'Logs'");
    expect(navSource).toContain("href: '/dashboard/logs'");
    expect(navSource).toContain("key: 'logs'");
    expect(iconSource).toContain('logs: FlashIcon');
  });

  it('ObservabilityToolbar contains source filters, live polling toggle, and status pills', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/ObservabilityToolbar.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('All activity');
    expect(source).toContain('API requests');
    expect(source).toContain('Webhooks');
    expect(source).toContain('AI requests');
    expect(source).toContain('Alerts');
    expect(source).toContain('Errors');
    expect(source).toContain('Auth & security');
    expect(source).toContain('Jobs & triggers');
    expect(source).toContain('App logs (SDK)');
    expect(source).toContain('User actions');
    expect(source).toContain('Live');
    expect(source).toContain('label="Level"');
    expect(source).toContain('label="Status"');
  });

  it('ObservabilityChart calculates and displays activity summary metrics', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/ObservabilityChart.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Activity over time');
    expect(source).toContain('label="Healthy"');
    expect(source).toContain('label="Errors"');
    expect(source).toContain('label="Warnings"');
    // App logs are info/warn/error, so health is "not a warning or an error".
    expect(source).toContain('summary.total - summary.error - summary.warning');
    expect(source).not.toContain('(5xx)');
    expect(source).toContain('summary.avgDuration');
    expect(source).toContain('summary.p95Duration');
    expect(source).toContain('onSelectBucket');
  });

  it('LogStreamTable renders dense logs with status codes and latency indicators', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/LogStreamTable.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Timestamp');
    expect(source).toContain('Level');
    expect(source).toContain('Source');
    expect(source).toContain('Method');
    expect(source).toContain('Target');
    expect(source).toContain('Message');
    expect(source).toContain('Latency');
    expect(source).toContain('Status');
    expect(source).toContain('onSelectLog');
  });

  it('LogDetailDrawer provides distributed trace waterfall and auto-redacted metadata', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/LogDetailDrawer.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Overview');
    expect(source).toContain('Trace Waterfall');
    expect(source).toContain('Metadata & Headers');
    expect(source).toContain('Error Details');
    expect(source).toContain('AI Execution Telemetry');
    expect(source).toContain('Sensitive tokens, keys and headers are redacted automatically');
    expect(source).toContain('View Session Replay');
    expect(source).toContain('View User Profile');
  });
});

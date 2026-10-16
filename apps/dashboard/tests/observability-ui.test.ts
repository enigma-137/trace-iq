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
    expect(source).toContain('Auth & Security');
    expect(source).toContain('Jobs & Triggers');
    expect(source).toContain('SDK Telemetry');
    expect(source).toContain('Live');
    expect(source).toContain('All levels');
    expect(source).toContain('All status');
  });

  it('ObservabilityChart calculates and displays activity summary metrics', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/ObservabilityChart.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Total Activity');
    expect(source).toContain('>Healthy<');
    expect(source).toContain('>Errors<');
    expect(source).toContain('>Warnings<');
    // App logs are info/warn/error, so health is "not a warning or an error".
    expect(source).toContain('summary.total - summary.error - summary.warning');
    expect(source).not.toContain('(5xx)');
    expect(source).toContain('Avg Latency');
    expect(source).toContain('p95 Latency');
    expect(source).toContain('onSelectBucket');
  });

  it('LogStreamTable renders dense logs with status codes and latency indicators', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/logs/LogStreamTable.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Time');
    expect(source).toContain('Level');
    expect(source).toContain('Source');
    expect(source).toContain('Service / Target');
    expect(source).toContain('Message / Operation');
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
    expect(source).toContain('Sensitive tokens, keys and headers automatically redacted');
    expect(source).toContain('View Session Replay');
    expect(source).toContain('View User Profile');
  });
});

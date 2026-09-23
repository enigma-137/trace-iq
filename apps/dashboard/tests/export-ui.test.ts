import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Export UI & Modal', () => {
  it('ExportPanel includes Export now CTA, quick presets, and programmatic API documentation', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/export/ExportPanel.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Export now');
    expect(source).toContain('Quick Export Presets');
    expect(source).toContain('Last 24 Hours');
    expect(source).toContain('Past 7 Days');
    expect(source).toContain('Past 30 Days');
    expect(source).toContain('Full JSON Dump');
    expect(source).toContain('Programmatic API Export');
    expect(source).toContain('TraceIQ Pro Delivery');
    expect(source).toContain('<ExportModal');
  });

  it('ExportModal provides date range, event picker, row cap, CSV/JSON formats, and Pro email delivery', () => {
    const source = readFileSync(
      new URL('../src/app/dashboard/export/ExportModal.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('Export Analytics Data');
    expect(source).toContain('Direct Download');
    expect(source).toContain('Send to Email');
    expect(source).toContain('DateRangePicker');
    expect(source).toContain('Row cap (max 50,000)');
    expect(source).toContain('Download {format.toUpperCase()}');
    expect(source).toContain('Email Exports with TraceIQ Pro');
    expect(source).toContain('/v1/dashboard/export/email');
  });
});

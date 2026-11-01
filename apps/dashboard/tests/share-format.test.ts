import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatShare } from '../src/lib/share-format';

describe('formatShare', () => {
  it('keeps whole numbers for ordinary shares', () => {
    expect(formatShare(1, 3)).toBe('33%');
    expect(formatShare(2, 3)).toBe('67%');
    expect(formatShare(50, 100)).toBe('50%');
    expect(formatShare(1, 100)).toBe('1%');
    expect(formatShare(99, 100)).toBe('99%');
  });

  it('does not hide a small share behind 0%', () => {
    // The admin chart: a tiny workspace next to one holding 836k events.
    expect(formatShare(3_200, 836_439)).toBe('0.4%');
    expect(formatShare(900, 836_439)).toBe('0.1%');
    expect(formatShare(300, 836_439)).toBe('<0.1%');
    expect(formatShare(1, 1_000_000)).toBe('<0.1%');
  });

  it('does not round a near-total share up to 100%', () => {
    expect(formatShare(833_239, 836_439)).toBe('99.6%');
    expect(formatShare(999_999, 1_000_000)).toBe('99.9%');
    expect(formatShare(9_999, 10_000)).toBe('99.9%');
  });

  it('shows 100% only for a true total, and 0% only for nothing', () => {
    expect(formatShare(5, 5)).toBe('100%');
    expect(formatShare(0, 5)).toBe('0%');
    expect(formatShare(5, 0)).toBe('0%');
  });
});

describe('DonutChart', () => {
  const source = readFileSync(new URL('../src/components/charts/DonutChart.tsx', import.meta.url), 'utf8');

  it('uses the shared share formatting instead of rounding to whole numbers', () => {
    expect(source).toContain("import { formatShare } from '@/lib/share-format'");
    expect(source).not.toContain('Math.round((item.value / total) * 100)');
  });

  it('shows counts only where a chart asks for them, and the admin event share does', () => {
    expect(source).toContain('showValues = false');
    const admin = readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');
    expect(admin).toMatch(/emptyLabel="No event data yet\."\s+showValues/);
  });
});

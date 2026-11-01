import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatDuration, percent } from '../src/lib/activation-format';

describe('percent', () => {
  it('rounds to a whole number and refuses to divide by zero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 5)).toBe(100);
    expect(percent(0, 4)).toBe(0);
    expect(percent(3, 0)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('picks a unit a person can read', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(0.1)).toBe('6 min');
    expect(formatDuration(0.001)).toBe('1 min');
    expect(formatDuration(3.25)).toBe('3.3 h');
    expect(formatDuration(5)).toBe('5 h');
    expect(formatDuration(47.9)).toBe('47.9 h');
    expect(formatDuration(72)).toBe('3 days');
    expect(formatDuration(60)).toBe('2.5 days');
  });
});

describe('admin page', () => {
  it('shows the activation section only when the API returned it, so an older API still loads', () => {
    const page = readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('access.activation ? <AdminActivationSection');
    const loader = readFileSync(new URL('../src/lib/admin.ts', import.meta.url), 'utf8');
    expect(loader).toContain('activation: activation.data ?? null');
  });
});

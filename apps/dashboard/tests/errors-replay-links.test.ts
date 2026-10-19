import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatLocal } from '../src/components/LocalTime';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const errorsView = read('../src/app/dashboard/errors/ErrorTrackingClientView.tsx');
const replaysWorkspace = read('../src/app/dashboard/replays/ReplaysWorkspace.tsx');

describe('Error tracking page', () => {
  it('links replays to the replays page filtered by session, never the missing /dashboard/sessions route', () => {
    expect(errorsView).not.toContain('/dashboard/sessions');
    expect(errorsView).toContain('/dashboard/replays?sessionId=${encodeURIComponent(sessionId)}');
  });

  it('opens a linked session in the replays list regardless of its age', () => {
    expect(replaysWorkspace).toContain("initialSessionId ? 'all' : '7d'");
  });

  it('offers a 24-hour range and shows an unknown days value instead of falling back to the first option', () => {
    expect(errorsView).toContain("{ value: '1', label: 'Last 24 hours' }");
    expect(errorsView).toContain('!DAY_OPTIONS.some((option) => option.value === days)');
  });

  it('applies the PATCH result to the issue so assign/unassign updates without a reload', () => {
    expect(errorsView).toMatch(/setSavedState\(\(previous\) => \(\{ \.\.\.previous, \[id\]: \{ status, assigneeUserId \} \}\)\)/);
    expect(errorsView).toContain('saved ? saved.assigneeUserId');
  });

  it('formats dates after mount on the errors and replays pages', () => {
    for (const source of [errorsView, replaysWorkspace]) {
      expect(source).toContain("from '@/components/LocalTime'");
      expect(source).not.toContain('new Intl.DateTimeFormat');
    }
  });
});

describe('LocalTime', () => {
  it('formats valid dates, passes through invalid ones and shows a dash for missing ones', () => {
    expect(formatLocal('2026-10-18T12:00:00.000Z', { year: 'numeric', timeZone: 'UTC' })).toBe('2026');
    expect(formatLocal('not a date', { year: 'numeric' })).toBe('not a date');
    expect(formatLocal(undefined, { year: 'numeric' })).toBe('—');
  });

  it('renders a placeholder until mounted so server and client markup match', () => {
    const source = read('../src/components/LocalTime.tsx');
    expect(source).toContain('useState<string | null>(null)');
    expect(source).toContain('useEffect(');
    expect(source).toContain('suppressHydrationWarning');
  });
});

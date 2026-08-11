import { afterEach, describe, expect, it } from 'vitest';
import { buildUnlockEmail, unlockSubject, type UnlockEmailItem } from '../src/modules/achievements/achievements.service';

function item(overrides: Partial<UnlockEmailItem> = {}): UnlockEmailItem {
  return {
    slug: 'first-signal',
    title: 'First Signal',
    description: 'Track your first 100 events.',
    category: 'Data',
    ...overrides
  };
}

describe('unlockSubject', () => {
  it('names the achievement for a single unlock', () => {
    expect(unlockSubject([item()])).toBe('Achievement unlocked: First Signal');
  });

  it('counts multiple unlocks', () => {
    expect(unlockSubject([item(), item({ slug: 'x', title: 'Other' })])).toBe('You unlocked 2 achievements on TraceIQ');
  });
});

describe('buildUnlockEmail', () => {
  afterEach(() => {
    delete process.env.DASHBOARD_URL;
  });

  it('renders every achievement card', () => {
    const html = buildUnlockEmail([
      item(),
      item({ slug: 'event-machine', title: 'Event Machine', description: 'Reach 10,000 events.', category: 'Data' })
    ]);
    expect(html).toContain('First Signal');
    expect(html).toContain('Event Machine');
    expect(html).toContain('Track your first 100 events.');
    expect(html).toContain('You earned <strong>2 achievements</strong>');
  });

  it('escapes HTML in titles and descriptions', () => {
    const html = buildUnlockEmail([item({ title: '<script>alert(1)</script>', description: 'Say <hello> & bye' })]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Say &lt;hello&gt; &amp; bye');
  });

  it('links to the dashboard using DASHBOARD_URL', () => {
    process.env.DASHBOARD_URL = 'https://app.traceiq.dev';
    const html = buildUnlockEmail([item()]);
    expect(html).toContain('href="https://app.traceiq.dev/dashboard/achievements"');
  });
});

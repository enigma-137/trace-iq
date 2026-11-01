import { describe, expect, it } from 'vitest';
import {
  MIN_BASELINE_EVENTS,
  buildBriefMessage,
  buildSlackBriefMessage,
  mentionsNumber,
  statsLine,
  suggestAction
} from '../src/modules/briefs/briefs.util';

const facts = (overrides: Partial<Parameters<typeof suggestAction>[0]> = {}) => ({
  eventsToday: 53,
  eventsYesterday: 204,
  deltaPct: -74,
  uniquesToday: 13,
  topEvent: { name: 'page_view', count: 40 },
  topCountry: { name: 'US', count: 26, pct: 49 },
  topDevice: null,
  activeNow: 0,
  lastEventAt: null,
  ...overrides
});

// What the AI wrote for Nuwell on the first Slack brief.
const AI_NARRATIVE =
  "Today's story for Nuwell AI Web shows a decrease in activity with 53 events in the last 24 hours, down 74% from the previous day. Thirteen unique users were active today, with the top event being page views.";

describe('mentionsNumber', () => {
  it('finds digits, thousands separators and small number words', () => {
    expect(mentionsNumber('53 events today', 53)).toBe(true);
    expect(mentionsNumber('1,320 events', 1320)).toBe(true);
    expect(mentionsNumber('1320 events', 1320)).toBe(true);
    expect(mentionsNumber('Thirteen unique users', 13)).toBe(true);
  });

  it('does not match a number inside a bigger one', () => {
    expect(mentionsNumber('153 events', 53)).toBe(false);
    expect(mentionsNumber('113 visitors', 13)).toBe(false);
    expect(mentionsNumber('1,053 events', 53)).toBe(false);
    expect(mentionsNumber('3.5 sessions', 5)).toBe(false);
  });

  it('does not treat a word as a different number', () => {
    expect(mentionsNumber('Thirteen users', 3)).toBe(false);
    expect(mentionsNumber('no activity', 0)).toBe(false);
  });
});

describe('statsLine', () => {
  it('is left out when the narrative already says both numbers', () => {
    expect(statsLine(AI_NARRATIVE, facts())).toBeNull();
  });

  it('adds only the number the narrative left out', () => {
    expect(statsLine('Events are up 20% (1,320 vs 1,065 yesterday).', facts({ eventsToday: 1320, uniquesToday: 412 }))).toBe('412 visitors');
    expect(statsLine('Quiet day.', facts({ eventsToday: 1320, uniquesToday: 412 }))).toBe('1,320 events · 412 visitors');
  });
});

describe('trend warning', () => {
  it('needs a real baseline before it says activity changed', () => {
    expect(suggestAction(facts({ eventsYesterday: MIN_BASELINE_EVENTS - 1, deltaPct: -80 }), null)).toBeNull();
    expect(suggestAction(facts({ eventsYesterday: MIN_BASELINE_EVENTS, deltaPct: -80 }), null)).toContain('down 80%');
  });

  it('shows the numbers behind the percentage', () => {
    expect(suggestAction(facts(), null)).toBe(
      'Activity is down 74% (53 events vs 204 the day before). Check Errors and anything you shipped recently.'
    );
  });
});

describe('the Nuwell brief that went out', () => {
  const input = {
    projectName: 'Nuwell AI Web',
    narrative: AI_NARRATIVE,
    facts: facts(),
    revenue: null,
    dashboardUrl: 'https://traceiq.run/dashboard'
  };

  it('no longer repeats the event and visitor counts, in Slack or Telegram', () => {
    for (const message of [buildSlackBriefMessage(input), buildBriefMessage(input)]) {
      expect(message).not.toContain('53 events · 13 visitors');
      expect(message.match(/53 events/g)).toHaveLength(2); // once in the narrative, once in the warning's numbers
      expect(message).not.toMatch(/\n\n\n/);
    }
  });

  it('keeps one blank line between sections when only revenue follows the narrative', () => {
    const message = buildSlackBriefMessage({ ...input, revenue: { total: 7000, transactions: 2, failed: 0, currency: 'NGN' } });
    expect(message).not.toMatch(/\n\n\n/);
    expect(message).toContain('Revenue: ₦7,000 · 2 paid');
  });
});

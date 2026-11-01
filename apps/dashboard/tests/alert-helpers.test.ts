import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  alertDestinations,
  alertStatus,
  destinationKinds,
  formatRelative,
  humanReadableCondition,
  latestDeliveries,
  ruleSummary,
  thresholdLabel,
  truncate,
  type AlertChatChannel,
  type AlertGroup,
  type AlertRecord
} from '../src/lib/alert-helpers';

const alert = (overrides: Partial<AlertRecord> = {}): AlertRecord => ({
  id: 'alt_1',
  name: 'Telegram test alert',
  eventName: '$api_request',
  measure: 'count',
  property: null,
  filters: [],
  windowHours: 24,
  condition: 'above',
  threshold: 0,
  webhookUrl: null,
  emailRecipients: [],
  notificationGroupIds: [],
  chatChannelIds: [],
  enabled: true,
  lastStatus: 'ok',
  lastValue: null,
  lastEvaluatedAt: null,
  deliveries: [],
  ...overrides
});

const channels: AlertChatChannel[] = [
  { id: 'brc_t', kind: 'telegram', name: '@Oxrune', enabled: true },
  { id: 'brc_s', kind: 'slack', name: '#all-traceiq (TraceIQ)', enabled: false }
];
const groups: AlertGroup[] = [{ id: 'grp_1', name: 'Backend on-call', memberEmails: ['a@b.co', 'c@d.co'] }];

describe('ruleSummary', () => {
  it('is one short line a list row can show', () => {
    expect(ruleSummary(alert())).toBe('$api_request · count above 0 · 24 hours');
    expect(ruleSummary(alert({ condition: 'drops_by', threshold: 30, windowHours: 168 }))).toBe('$api_request · count drop of 30% · 7 days');
    expect(ruleSummary(alert({ condition: 'below', threshold: 1, windowHours: 1 }))).toBe('$api_request · count below 1 · 1 hour');
  });

  it('names the property for sum and average, and the measure for unique users', () => {
    expect(ruleSummary(alert({ measure: 'sum', property: 'amount', threshold: 5000 }))).toBe('$api_request · sum of amount above 5,000 · 24 hours');
    expect(ruleSummary(alert({ measure: 'avg', property: 'durationMs' }))).toContain('average of durationMs');
    expect(ruleSummary(alert({ measure: 'unique' }))).toContain('unique users');
  });
});

describe('humanReadableCondition', () => {
  it('keeps the full sentence for the details view, and now reads sum correctly', () => {
    expect(humanReadableCondition(alert())).toBe('Triggers when count of "$api_request" rises above 0 in a rolling 24 hours window.');
    expect(humanReadableCondition(alert({ condition: 'spikes_by', threshold: 50, windowHours: 1 }))).toContain('spikes by 50% over a rolling 1 hour window');
    // Sum used to read as "average".
    expect(humanReadableCondition(alert({ measure: 'sum', property: 'amount' }))).toContain('sum of "amount"');
    expect(humanReadableCondition(alert({ measure: 'avg', property: 'amount' }))).toContain('average "amount"');
  });

  it('labels the threshold', () => {
    expect(thresholdLabel(alert({ condition: 'above', threshold: 1500 }))).toBe('above 1,500');
    expect(thresholdLabel(alert({ condition: 'spikes_by', threshold: 50 }))).toBe('spike of 50%');
  });
});

describe('alertStatus', () => {
  it('ranks locked, paused, firing and active in that order of precedence', () => {
    expect(alertStatus(alert(), false).key).toBe('locked');
    expect(alertStatus(alert({ enabled: false, lastStatus: 'triggered' }), true).key).toBe('paused');
    expect(alertStatus(alert({ lastStatus: 'triggered' }), true).key).toBe('firing');
    expect(alertStatus(alert(), true).key).toBe('active');
  });
});

describe('alertDestinations', () => {
  it('lists chats first, then email, groups and the webhook, with the services named', () => {
    const list = alertDestinations(
      alert({
        chatChannelIds: ['brc_t'],
        emailRecipients: ['ops@b.co'],
        notificationGroupIds: ['grp_1'],
        webhookUrl: 'https://hooks.example.com/alerts/abc'
      }),
      groups,
      channels
    );
    expect(list.map((item) => [item.kind, item.label])).toEqual([
      ['telegram', 'Telegram · @Oxrune'],
      ['email', 'ops@b.co'],
      ['group', 'Backend on-call (2)'],
      ['webhook', 'Webhook · hooks.example.com']
    ]);
    expect(list.every((item) => item.note === null)).toBe(true);
  });

  it('explains a paused chat, a disconnected chat and a deleted group instead of hiding them', () => {
    const list = alertDestinations(alert({ chatChannelIds: ['brc_s', 'brc_gone'], notificationGroupIds: ['grp_gone'] }), groups, channels);
    expect(list[0]).toMatchObject({ kind: 'slack', label: 'Slack · #all-traceiq (TraceIQ)' });
    expect(list[0].note).toContain('Paused in Daily brief');
    expect(list[1]).toMatchObject({ label: 'Disconnected chat' });
    expect(list[1].note).toContain('disconnected');
    expect(list[2]).toMatchObject({ kind: 'group', label: 'Deleted group' });
  });

  it('never shows a webhook URL, only its host', () => {
    const [webhook] = alertDestinations(alert({ webhookUrl: 'https://hooks.slack.com/services/T0/B0/secretvalue' }), groups, channels);
    expect(webhook.label).toBe('Webhook · hooks.slack.com');
    expect(JSON.stringify(webhook)).not.toContain('secretvalue');
  });

  it('collapses to distinct kinds for the icon cluster on a row', () => {
    const list = alertDestinations(alert({ emailRecipients: ['a@b.co', 'c@d.co', 'e@f.co'], chatChannelIds: ['brc_t', 'brc_s'] }), groups, channels);
    expect(list).toHaveLength(5);
    expect(destinationKinds(list)).toEqual(['telegram', 'slack', 'email']);
    expect(destinationKinds([])).toEqual([]);
  });
});

describe('latestDeliveries and formatting', () => {
  it('keeps only the most recent firing’s deliveries', () => {
    const delivery = (sentAt: string, recipient: string) => ({ channel: 'email', recipient, status: 'sent', error: null, sentAt });
    const latest = latestDeliveries([
      delivery('2026-11-01T10:00:30Z', 'new-1'),
      delivery('2026-11-01T10:00:00Z', 'new-2'),
      delivery('2026-10-30T09:00:00Z', 'old')
    ]);
    expect(latest.map((item) => item.recipient)).toEqual(['new-1', 'new-2']);
    expect(latestDeliveries([])).toEqual([]);
  });

  it('formats relative times and truncates', () => {
    const now = new Date('2026-11-01T12:00:00Z').getTime();
    expect(formatRelative('2026-11-01T11:59:50Z', now)).toBe('just now');
    expect(formatRelative('2026-11-01T11:30:00Z', now)).toBe('30 min ago');
    expect(formatRelative('2026-11-01T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative(null, now)).toBe('never');
    expect(truncate('abcdefghij', 6)).toBe('abcde…');
    expect(truncate('abc', 6)).toBe('abc');
  });
});

describe('alerts list', () => {
  const manager = readFileSync(new URL('../src/app/dashboard/alerts/AlertManager.tsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/app/dashboard/alerts/AlertDetailsModal.tsx', import.meta.url), 'utf8');

  it('is a compact row that opens the details, not a wall of chips and buttons', () => {
    expect(manager).toContain('onClick={() => setDetailsId(alert.id)}');
    expect(manager).toContain('ruleSummary(alert)');
    expect(manager).not.toContain('Destinations and delivery results');
    expect(manager).not.toContain('label="Test now"');
    expect(manager).not.toContain('Last notified');
  });

  it('keeps every action, now in the details modal', () => {
    for (const label of ['Test now', 'Pause', 'Resume', 'Duplicate', 'Delete']) expect(modal).toContain(label);
    expect(modal).toContain('Sends to');
    expect(modal).toContain('Latest check');
  });

  it('hands off to the existing delete confirmation and the create form, closing the details first', () => {
    expect(manager).toMatch(/onDelete=\{\(target\) => \{\s*setDetailsId\(null\);\s*setAlertToDelete\(target\);/);
    expect(manager).toMatch(/onDuplicate=\{\(target\) => \{\s*setDetailsId\(null\);\s*handleOpenDuplicateAlert\(target\);/);
  });

  it('looks the open alert up from the live list, so it refreshes after pausing and closes after deleting', () => {
    expect(manager).toContain('alerts.find((item) => item.id === detailsId) ?? null');
  });
});

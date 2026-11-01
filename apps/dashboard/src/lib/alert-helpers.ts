import type { FilterCondition } from '@/components/SegmentFilters';

export interface AlertDelivery {
  channel: string;
  recipient: string | null;
  status: string;
  error: string | null;
  sentAt: string;
}

export interface AlertRecord {
  id: string;
  name: string;
  eventName: string;
  measure: string;
  property: string | null;
  filters: FilterCondition[];
  windowHours: number;
  condition: string;
  threshold: number;
  webhookUrl: string | null;
  emailRecipients: string[];
  notificationGroupIds: string[];
  chatChannelIds: string[];
  enabled: boolean;
  lastStatus: string;
  lastValue: number | null;
  lastEvaluatedAt: string | null;
  deliveries: AlertDelivery[];
}

export interface AlertGroup {
  id: string;
  name: string;
  memberEmails: string[];
}

export interface AlertChatChannel {
  id: string;
  kind: 'telegram' | 'slack';
  name: string;
  enabled: boolean;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatRelative(value: string | null, now: number = Date.now()): string {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : formatDate(value);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function windowLabel(hours: number): string {
  return hours === 168 ? '7 days' : hours === 1 ? '1 hour' : `${hours} hours`;
}

function metricPhrase(alert: AlertRecord): string {
  if (alert.measure === 'unique') return `unique users for "${alert.eventName}"`;
  if (alert.measure === 'sum') return `sum of ${alert.property ? `"${alert.property}"` : 'property'} for "${alert.eventName}"`;
  if (alert.measure === 'avg') return `average ${alert.property ? `"${alert.property}"` : 'property'} for "${alert.eventName}"`;
  return `count of "${alert.eventName}"`;
}

/** The full sentence, for the details view. */
export function humanReadableCondition(alert: AlertRecord): string {
  const metric = metricPhrase(alert);
  const window = windowLabel(alert.windowHours);
  switch (alert.condition) {
    case 'drops_by':
      return `Triggers when ${metric} drops by ${alert.threshold}% over a rolling ${window} window.`;
    case 'spikes_by':
      return `Triggers when ${metric} spikes by ${alert.threshold}% over a rolling ${window} window.`;
    case 'above':
      return `Triggers when ${metric} rises above ${alert.threshold.toLocaleString()} in a rolling ${window} window.`;
    case 'below':
      return `Triggers when ${metric} falls below ${alert.threshold.toLocaleString()} in a rolling ${window} window.`;
    default:
      return `${metric} ${alert.condition} ${alert.threshold} over ${window}`;
  }
}

export function thresholdLabel(alert: AlertRecord): string {
  switch (alert.condition) {
    case 'above':
      return `above ${formatNumber(alert.threshold)}`;
    case 'below':
      return `below ${formatNumber(alert.threshold)}`;
    case 'drops_by':
      return `drop of ${alert.threshold}%`;
    case 'spikes_by':
      return `spike of ${alert.threshold}%`;
    default:
      return `${alert.condition} ${formatNumber(alert.threshold)}`;
  }
}

/** One short line for a list row: `$api_request · count above 0 · 24 hours`. */
export function ruleSummary(alert: AlertRecord): string {
  const measure =
    alert.measure === 'unique' ? 'unique users' : alert.measure === 'sum' ? 'sum' : alert.measure === 'avg' ? 'average' : 'count';
  const property = (alert.measure === 'sum' || alert.measure === 'avg') && alert.property ? ` of ${alert.property}` : '';
  return `${alert.eventName} · ${measure}${property} ${thresholdLabel(alert)} · ${windowLabel(alert.windowHours)}`;
}

export function alertStatus(alert: AlertRecord, alertsAvailable: boolean) {
  if (!alertsAvailable) {
    return { key: 'locked', label: 'Pro required', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300', dot: 'bg-amber-500' };
  }
  if (!alert.enabled) {
    return { key: 'paused', label: 'Paused', badge: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-neutral-400' };
  }
  if (alert.lastStatus === 'triggered') {
    return { key: 'firing', label: 'Firing', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', dot: 'bg-red-500 animate-pulse' };
  }
  return { key: 'active', label: 'Active', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', dot: 'bg-emerald-500' };
}

/** The deliveries from the most recent firing (they share a send time within a minute). */
export function latestDeliveries(deliveries: AlertDelivery[]): AlertDelivery[] {
  if (deliveries.length === 0) return [];
  const sorted = [...deliveries].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  const newest = new Date(sorted[0].sentAt).getTime();
  return sorted.filter((d) => newest - new Date(d.sentAt).getTime() < 60_000).slice(0, 5);
}

export type DestinationKind = 'telegram' | 'slack' | 'email' | 'webhook' | 'group';

export interface AlertDestination {
  key: string;
  kind: DestinationKind;
  label: string;
  /** Why this destination may not receive anything right now. */
  note: string | null;
}

/** Everything an alert sends to, in a stable order: chats, email, groups, webhook. */
export function alertDestinations(alert: AlertRecord, groups: AlertGroup[], channels: AlertChatChannel[]): AlertDestination[] {
  const destinations: AlertDestination[] = [];

  for (const channelId of alert.chatChannelIds) {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) {
      destinations.push({ key: channelId, kind: 'slack', label: 'Disconnected chat', note: 'This chat was disconnected. Pick another when you edit the alert.' });
      continue;
    }
    destinations.push({
      key: channelId,
      kind: channel.kind,
      label: `${channel.kind === 'slack' ? 'Slack' : 'Telegram'} · ${channel.name}`,
      note: channel.enabled ? null : 'Paused in Daily brief, so alerts skip it until it is turned on.'
    });
  }
  for (const email of alert.emailRecipients) destinations.push({ key: `email:${email}`, kind: 'email', label: email, note: null });
  for (const groupId of alert.notificationGroupIds) {
    const group = groups.find((item) => item.id === groupId);
    destinations.push({
      key: `group:${groupId}`,
      kind: 'group',
      label: group ? `${group.name} (${group.memberEmails.length})` : 'Deleted group',
      note: group ? null : 'This group was deleted.'
    });
  }
  if (alert.webhookUrl) destinations.push({ key: 'webhook', kind: 'webhook', label: `Webhook · ${hostOf(alert.webhookUrl)}`, note: null });
  return destinations;
}

/** The distinct kinds, for the small icon cluster on a list row. */
export function destinationKinds(destinations: AlertDestination[]): DestinationKind[] {
  return Array.from(new Set(destinations.map((destination) => destination.kind)));
}

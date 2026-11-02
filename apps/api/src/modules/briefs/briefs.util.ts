// Pure helpers for the daily brief: timezone maths, link codes and the message itself.
// Nothing here touches the database or the network.

import { createHash, randomBytes } from 'node:crypto';
import type { TodayStoryFacts } from '../insights/insights.service';

export const DEFAULT_SEND_HOUR = 8;
export const DEFAULT_TIMEZONE = 'UTC';
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) and hour (0-23) it currently is in `timeZone`. */
export function localDateAndHour(now: Date, timeZone: string): { date: string; hour: number } {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** Daily on Pro, weekly on Free. Weekly briefs go out on Mondays and cover the last 7 days. */
export type BriefCadence = 'daily' | 'weekly';
export const WEEKLY_BRIEF_WEEKDAY = 1;

export function briefWindowDays(cadence: BriefCadence): number {
  return cadence === 'weekly' ? 7 : 1;
}

/**
 * What a brief can cover when someone asks for one in a chat. Daily and weekly are also the
 * two schedules; monthly and all time are only ever asked for.
 */
export type BriefPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

export const BRIEF_PERIODS: readonly BriefPeriod[] = ['daily', 'weekly', 'monthly', 'all'];

/** Days a period looks back, or 'all' for everything since the first event. */
export function periodDays(period: BriefPeriod): number | 'all' {
  return period === 'daily' ? 1 : period === 'weekly' ? 7 : period === 'monthly' ? 30 : 'all';
}

/** The word in the brief's title: "your weekly brief", "your all-time brief". */
export function periodLabel(period: BriefPeriod): string {
  return period === 'all' ? 'all-time' : period;
}

/** The look-back window for the revenue query. `all` is long enough to cover any project. */
export function periodRevenueInterval(period: BriefPeriod): '1 day' | '7 days' | '30 days' | '36500 days' {
  return period === 'daily' ? '1 day' : period === 'weekly' ? '7 days' : period === 'monthly' ? '30 days' : '36500 days';
}

/**
 * Reads a period from what someone typed or tapped: "weekly", "week", "30d", "all time",
 * "all_time", "alltime". Null when it isn't one, so the caller can ask instead of guessing.
 */
export function parsePeriod(text: string | null | undefined): BriefPeriod | null {
  const word = (text ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['daily', 'day', 'today', '24h', '1d'].includes(word)) return 'daily';
  if (['weekly', 'week', '7d', '7days'].includes(word)) return 'weekly';
  if (['monthly', 'month', '30d', '30days'].includes(word)) return 'monthly';
  if (['all', 'alltime', 'everything', 'total', 'lifetime'].includes(word)) return 'all';
  return null;
}

/** The ISO weekday (Monday 1 … Sunday 7) it currently is in `timeZone`. */
export function localWeekday(now: Date, timeZone: string): number {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

/**
 * A channel is due once its local send hour has arrived and today's brief hasn't gone
 * out (and, for a weekly brief, it is Monday there). `>=` rather than `==` so a restart
 * during the send hour still delivers it.
 */
export function isBriefDue(
  channel: { sendHour: number; timezone: string; lastSentOn: string | null },
  now: Date,
  cadence: BriefCadence = 'daily'
): { due: boolean; localDate: string } {
  const local = localDateAndHour(now, channel.timezone);
  const rightDay = cadence === 'daily' || localWeekday(now, channel.timezone) === WEEKLY_BRIEF_WEEKDAY;
  return { due: rightDay && local.hour >= channel.sendHour && channel.lastSentOn !== local.date, localDate: local.date };
}

export function newLinkCode(): { code: string; hash: string } {
  const code = randomBytes(18).toString('base64url');
  return { code, hash: hashLinkCode(code) };
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

export interface BriefRevenue {
  total: number;
  transactions: number;
  failed: number;
  currency: string;
}

export interface BriefInput {
  projectName: string;
  narrative: string;
  facts: TodayStoryFacts;
  revenue: BriefRevenue | null;
  dashboardUrl: string;
  /**
   * What the brief covers. Defaults to daily. A weekly brief with an `upgradeUrl` (the Free
   * plan's schedule) offers the upgrade to daily; Pro people asking for a weekly one don't get it.
   */
  cadence?: BriefPeriod;
  upgradeUrl?: string;
}

/** True when a project had no activity in the last two days, so there is nothing to say. */
export function isQuietDay(facts: TodayStoryFacts): boolean {
  return facts.eventsToday + facts.eventsYesterday === 0;
}

/**
 * One concrete thing to look at, chosen by plain rules from the numbers. Returns null
 * when nothing stands out, so the brief never invents advice.
 */
export function suggestAction(facts: TodayStoryFacts, revenue: BriefRevenue | null, cadence: BriefPeriod = 'daily'): string | null {
  const span =
    cadence === 'weekly'
      ? { when: 'in the last 7 days', unit: 'week' }
      : cadence === 'monthly'
        ? { when: 'in the last 30 days', unit: 'month' }
        : cadence === 'all'
          ? { when: 'so far', unit: '' }
          : { when: 'in the last 24 hours', unit: 'day' };
  if (revenue) {
    const attempts = revenue.transactions + revenue.failed;
    if (revenue.failed >= 3 && attempts > 0 && revenue.failed / attempts >= 0.3) {
      return `${revenue.failed} of ${attempts} payments failed ${span.when}. Check the failure reasons and your payment provider.`;
    }
  }
  // A percentage means little on a small base: 3 events falling to 1 is "down 67%". Below this
  // many events the period before, the brief reports the numbers and keeps quiet about trends.
  // All time has nothing before it to compare with.
  if (cadence !== 'all' && facts.deltaPct !== null && facts.eventsYesterday >= MIN_BASELINE_EVENTS) {
    const counts = `${facts.eventsToday.toLocaleString('en')} events vs ${facts.eventsYesterday.toLocaleString('en')} the ${span.unit} before`;
    if (facts.deltaPct <= -25) {
      return `Activity is down ${Math.abs(facts.deltaPct)}% (${counts}). Check Errors and anything you shipped recently.`;
    }
    if (facts.deltaPct >= 50) {
      const where = facts.topCountry ? `, ${facts.topCountry.pct}% from ${facts.topCountry.name}` : '';
      return `Activity is up ${facts.deltaPct}%${where} (${counts}). Find out where it came from.`;
    }
  }
  return null;
}

export const MIN_BASELINE_EVENTS = 50;

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'
];

/** True when the text already states this number, as digits ("1,320" or "1320") or a word up to twenty. */
export function mentionsNumber(text: string, value: number): boolean {
  const digits = [value.toLocaleString('en'), String(value)];
  if (digits.some((form) => new RegExp(`(?<![\\d,.])${form.replace(/[.,]/g, '\\$&')}(?![\\d])`).test(text))) return true;
  const word = NUMBER_WORDS[value];
  return word !== undefined && new RegExp(`\\b${word}\\b`, 'i').test(text);
}

/**
 * The "N events · N visitors" line, without repeating what the narrative already says.
 * Returns null when the narrative covers both numbers.
 */
export function statsLine(narrative: string, facts: TodayStoryFacts): string | null {
  const parts: string[] = [];
  if (!mentionsNumber(narrative, facts.eventsToday)) parts.push(`${facts.eventsToday.toLocaleString('en')} events`);
  if (!mentionsNumber(narrative, facts.uniquesToday)) parts.push(`${facts.uniquesToday.toLocaleString('en')} visitors`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The Telegram message (HTML parse mode). Kept short: it's read on a phone. */
export function buildBriefMessage(input: BriefInput): string {
  const { facts, revenue } = input;
  const cadence = input.cadence ?? 'daily';
  const lines: string[] = [`<b>${escapeHtml(input.projectName)}</b> · your ${periodLabel(cadence)} brief`, '', escapeHtml(input.narrative)];

  const summary: string[] = [];
  const stats = statsLine(input.narrative, facts);
  if (stats) summary.push(stats);
  if (revenue) {
    const paid = `${revenue.transactions.toLocaleString('en')} paid`;
    const failed = revenue.failed > 0 ? ` · ${revenue.failed.toLocaleString('en')} failed` : '';
    summary.push(`Revenue: ${escapeHtml(formatMoney(revenue.total, revenue.currency))} · ${paid}${failed}`);
  }
  if (summary.length > 0) lines.push('', ...summary);

  const action = suggestAction(facts, revenue, cadence);
  if (action) lines.push('', `<b>Look at this:</b> ${escapeHtml(action)}`);

  lines.push('', `<a href="${escapeHtml(input.dashboardUrl)}">Open TraceIQ</a>`);
  if (cadence === 'weekly' && input.upgradeUrl) {
    lines.push(`Want this every day? <a href="${escapeHtml(input.upgradeUrl)}">Upgrade to Pro</a>.`);
  }
  return lines.join('\n');
}

export function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The same brief as {@link buildBriefMessage}, in Slack mrkdwn. */
export function buildSlackBriefMessage(input: BriefInput): string {
  const { facts, revenue } = input;
  const cadence = input.cadence ?? 'daily';
  const lines: string[] = [`*${escapeSlack(input.projectName)}* · your ${periodLabel(cadence)} brief`, '', escapeSlack(input.narrative)];

  const summary: string[] = [];
  const stats = statsLine(input.narrative, facts);
  if (stats) summary.push(stats);
  if (revenue) {
    const failed = revenue.failed > 0 ? ` · ${revenue.failed.toLocaleString('en')} failed` : '';
    summary.push(`Revenue: ${escapeSlack(formatMoney(revenue.total, revenue.currency))} · ${revenue.transactions.toLocaleString('en')} paid${failed}`);
  }
  if (summary.length > 0) lines.push('', ...summary);

  const action = suggestAction(facts, revenue, cadence);
  if (action) lines.push('', `*Look at this:* ${escapeSlack(action)}`);

  lines.push('', `<${input.dashboardUrl}|Open TraceIQ>`);
  if (cadence === 'weekly' && input.upgradeUrl) {
    lines.push(`Want this every day? <${input.upgradeUrl}|Upgrade to Pro>.`);
  }
  return lines.join('\n');
}

export interface ChatAlert {
  name: string;
  message: string;
  alertUrl: string;
}

/** An alert that fired, as a Telegram message (HTML parse mode). */
export function buildTelegramAlertMessage(alert: ChatAlert): string {
  return [
    `<b>Alert: ${escapeHtml(alert.name)}</b>`,
    escapeHtml(alert.message),
    '',
    `<a href="${escapeHtml(alert.alertUrl)}">Open in TraceIQ</a>`
  ].join('\n');
}

/** The same alert in Slack mrkdwn. */
export function buildSlackAlertMessage(alert: ChatAlert): string {
  return [`*Alert: ${escapeSlack(alert.name)}*`, escapeSlack(alert.message), '', `<${alert.alertUrl}|Open in TraceIQ>`].join('\n');
}

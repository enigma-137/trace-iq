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

/**
 * A channel is due once its local send hour has arrived and today's brief hasn't gone
 * out. `>=` rather than `==` so a restart during the send hour still delivers it.
 */
export function isBriefDue(
  channel: { sendHour: number; timezone: string; lastSentOn: string | null },
  now: Date
): { due: boolean; localDate: string } {
  const local = localDateAndHour(now, channel.timezone);
  return { due: local.hour >= channel.sendHour && channel.lastSentOn !== local.date, localDate: local.date };
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
}

/** True when a project had no activity in the last two days, so there is nothing to say. */
export function isQuietDay(facts: TodayStoryFacts): boolean {
  return facts.eventsToday + facts.eventsYesterday === 0;
}

/**
 * One concrete thing to look at, chosen by plain rules from the numbers. Returns null
 * when nothing stands out, so the brief never invents advice.
 */
export function suggestAction(facts: TodayStoryFacts, revenue: BriefRevenue | null): string | null {
  if (revenue) {
    const attempts = revenue.transactions + revenue.failed;
    if (revenue.failed >= 3 && attempts > 0 && revenue.failed / attempts >= 0.3) {
      return `${revenue.failed} of ${attempts} payments failed in the last 24 hours. Check the failure reasons and your payment provider.`;
    }
  }
  // A percentage means little on a small base: 3 events falling to 1 is "down 67%". Below this
  // many events the day before, the brief reports the numbers and keeps quiet about trends.
  if (facts.deltaPct !== null && facts.eventsYesterday >= MIN_BASELINE_EVENTS) {
    const counts = `${facts.eventsToday.toLocaleString('en')} events vs ${facts.eventsYesterday.toLocaleString('en')} the day before`;
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
  const lines: string[] = [`<b>${escapeHtml(input.projectName)}</b> · your daily brief`, '', escapeHtml(input.narrative)];

  const summary: string[] = [];
  const stats = statsLine(input.narrative, facts);
  if (stats) summary.push(stats);
  if (revenue) {
    const paid = `${revenue.transactions.toLocaleString('en')} paid`;
    const failed = revenue.failed > 0 ? ` · ${revenue.failed.toLocaleString('en')} failed` : '';
    summary.push(`Revenue: ${escapeHtml(formatMoney(revenue.total, revenue.currency))} · ${paid}${failed}`);
  }
  if (summary.length > 0) lines.push('', ...summary);

  const action = suggestAction(facts, revenue);
  if (action) lines.push('', `<b>Look at this:</b> ${escapeHtml(action)}`);

  lines.push('', `<a href="${escapeHtml(input.dashboardUrl)}">Open TraceIQ</a>`);
  return lines.join('\n');
}

export function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The same brief as {@link buildBriefMessage}, in Slack mrkdwn. */
export function buildSlackBriefMessage(input: BriefInput): string {
  const { facts, revenue } = input;
  const lines: string[] = [`*${escapeSlack(input.projectName)}* · your daily brief`, '', escapeSlack(input.narrative)];

  const summary: string[] = [];
  const stats = statsLine(input.narrative, facts);
  if (stats) summary.push(stats);
  if (revenue) {
    const failed = revenue.failed > 0 ? ` · ${revenue.failed.toLocaleString('en')} failed` : '';
    summary.push(`Revenue: ${escapeSlack(formatMoney(revenue.total, revenue.currency))} · ${revenue.transactions.toLocaleString('en')} paid${failed}`);
  }
  if (summary.length > 0) lines.push('', ...summary);

  const action = suggestAction(facts, revenue);
  if (action) lines.push('', `*Look at this:* ${escapeSlack(action)}`);

  lines.push('', `<${input.dashboardUrl}|Open TraceIQ>`);
  return lines.join('\n');
}

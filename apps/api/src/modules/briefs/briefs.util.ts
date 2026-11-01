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
  if (facts.deltaPct !== null && facts.eventsYesterday >= 20) {
    if (facts.deltaPct <= -25) {
      return `Activity is down ${Math.abs(facts.deltaPct)}%. Check Errors and anything you shipped recently.`;
    }
    if (facts.deltaPct >= 50) {
      const where = facts.topCountry ? `, ${facts.topCountry.pct}% from ${facts.topCountry.name}` : '';
      return `Activity is up ${facts.deltaPct}%${where}. Find out where it came from.`;
    }
  }
  return null;
}

/** The Telegram message (HTML parse mode). Kept short: it's read on a phone. */
export function buildBriefMessage(input: BriefInput): string {
  const { facts, revenue } = input;
  const lines: string[] = [`<b>${escapeHtml(input.projectName)}</b> · your daily brief`, '', escapeHtml(input.narrative)];

  const stats = [`${facts.eventsToday.toLocaleString('en')} events`, `${facts.uniquesToday.toLocaleString('en')} visitors`];
  lines.push('', stats.join(' · '));

  if (revenue) {
    const paid = `${revenue.transactions.toLocaleString('en')} paid`;
    const failed = revenue.failed > 0 ? ` · ${revenue.failed.toLocaleString('en')} failed` : '';
    lines.push(`Revenue: ${escapeHtml(formatMoney(revenue.total, revenue.currency))} · ${paid}${failed}`);
  }

  const action = suggestAction(facts, revenue);
  if (action) lines.push('', `<b>Look at this:</b> ${escapeHtml(action)}`);

  lines.push('', `<a href="${escapeHtml(input.dashboardUrl)}">Open TraceIQ</a>`);
  return lines.join('\n');
}

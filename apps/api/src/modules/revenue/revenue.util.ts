import { BadRequestException } from '@nestjs/common';
import { NUMERIC_GUARD } from '../../common/measures';
import { DatabaseService } from '../../database/database.service';

export interface RevenueSettings {
  enabled: boolean;
  successEvents: string[];
  failedEvents: string[];
  amountProperty: string;
  currency: string;
}

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = {
  enabled: false,
  successEvents: [],
  failedEvents: [],
  amountProperty: 'amount',
  currency: 'USD'
};

const MAX_EVENTS = 20;
const EVENT_NAME_PATTERN = /^[^\s$][^\s]{0,199}$/;
const PROPERTY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

// Names that describe intent rather than money received (checkout_started, plan_selected).
const INTENT_EVENT = /(^|_)(start|started|initiated|redirected|viewed|opened|clicked|selected|shown|added|attempted|abandoned|cancelled|canceled|pending|returned)($|_)/i;
const FAILED_EVENT = /(^|_)(failed|failure|declined|error)($|_)/i;
const PAYMENT_WORD = /(^|_)(payment|paid|charge|purchase|purchased|subscription|subscribed|order|checkout|transfer|payout|deposit|invoice|renewal|renewed|revenue|sale)($|_|s)/i;

interface RevenueSettingsRow {
  [column: string]: unknown;
  enabled: boolean;
  success_events: string[];
  failed_events: string[];
  amount_property: string;
  currency: string;
}

/** The project's revenue settings, or null when revenue tracking was never set up. */
export async function loadRevenueSettings(database: DatabaseService, projectId: string): Promise<RevenueSettings | null> {
  const result = await database.query<RevenueSettingsRow>(
    `SELECT enabled, success_events, failed_events, amount_property, currency
     FROM revenue_settings WHERE project_id = $1`,
    [projectId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    enabled: row.enabled,
    successEvents: row.success_events ?? [],
    failedEvents: row.failed_events ?? [],
    amountProperty: row.amount_property,
    currency: row.currency
  };
}

/** Whether revenue metrics should be computed for these settings. */
export function revenueActive(settings: RevenueSettings | null): settings is RevenueSettings {
  return Boolean(settings?.enabled && settings.successEvents.length > 0);
}

export interface RevenueTotals {
  total: number;
  previous: number;
  transactions: number;
  failed: number;
  previousTransactions: number;
  previousFailed: number;
}

/**
 * Revenue for the last `interval` and the one before it: the amount property summed over
 * successful payment events, and counts of successful and failed payments.
 * `interval` is a trusted SQL interval literal such as '7 days', never user input.
 */
export async function queryRevenueTotals(
  database: DatabaseService,
  projectId: string,
  settings: RevenueSettings,
  interval: string
): Promise<RevenueTotals> {
  const since = `now() - interval '${interval}'`;
  const result = await database.query<RevenueTotals & Record<string, unknown>>(
    `
      WITH payments AS (
        SELECT
          occurred_at,
          event_name = ANY($2::text[]) AS ok,
          CASE WHEN properties->>$4 ~ ${NUMERIC_GUARD} THEN (properties->>$4)::numeric END AS amount
        FROM events
        WHERE project_id = $1
          AND occurred_at >= now() - interval '${interval}' * 2
          AND event_name = ANY($2::text[] || $3::text[])
      )
      SELECT
        COALESCE(sum(amount) FILTER (WHERE ok AND occurred_at >= ${since}), 0)::float AS total,
        COALESCE(sum(amount) FILTER (WHERE ok AND occurred_at < ${since}), 0)::float AS previous,
        count(*) FILTER (WHERE ok AND occurred_at >= ${since})::int AS transactions,
        count(*) FILTER (WHERE NOT ok AND occurred_at >= ${since})::int AS failed,
        count(*) FILTER (WHERE ok AND occurred_at < ${since})::int AS "previousTransactions",
        count(*) FILTER (WHERE NOT ok AND occurred_at < ${since})::int AS "previousFailed"
      FROM payments
    `,
    [projectId, settings.successEvents, settings.failedEvents, settings.amountProperty]
  );
  const row = result.rows[0];
  return {
    total: row?.total ?? 0,
    previous: row?.previous ?? 0,
    transactions: row?.transactions ?? 0,
    failed: row?.failed ?? 0,
    previousTransactions: row?.previousTransactions ?? 0,
    previousFailed: row?.previousFailed ?? 0
  };
}

/**
 * Guesses what an event means for revenue from its name, so the setup page can
 * pre-select likely candidates. It is only a suggestion; the user decides.
 */
export function suggestRevenueRole(eventName: string, hasAmount: boolean): 'success' | 'failed' | null {
  if (eventName.startsWith('$')) return null;
  if (FAILED_EVENT.test(eventName)) return PAYMENT_WORD.test(eventName) ? 'failed' : null;
  if (INTENT_EVENT.test(eventName)) return null;
  return hasAmount && PAYMENT_WORD.test(eventName) ? 'success' : null;
}

/** Validates a settings update and merges it over the current settings. */
export function normalizeRevenueSettings(input: Partial<RevenueSettings>, current: RevenueSettings): RevenueSettings {
  const successEvents = input.successEvents === undefined ? current.successEvents : cleanEventList(input.successEvents, 'successEvents');
  const failedEvents = input.failedEvents === undefined ? current.failedEvents : cleanEventList(input.failedEvents, 'failedEvents');
  const overlap = successEvents.find((name) => failedEvents.includes(name));
  if (overlap) throw new BadRequestException(`"${overlap}" can't be both a successful and a failed payment event.`);

  const amountProperty = input.amountProperty === undefined ? current.amountProperty : String(input.amountProperty).trim();
  if (!PROPERTY_PATTERN.test(amountProperty)) {
    throw new BadRequestException('Amount property must be 1-64 letters, numbers, dots, dashes or underscores.');
  }

  const currency = input.currency === undefined ? current.currency : String(input.currency).trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) throw new BadRequestException('Currency must be a 3-letter code, like NGN or USD.');

  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;
  if (enabled && successEvents.length === 0) {
    throw new BadRequestException('Pick at least one successful payment event before turning revenue on.');
  }

  return { enabled, successEvents, failedEvents, amountProperty, currency };
}

function cleanEventList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${field} must be a list of event names.`);
  const names = [...new Set(value.map((name) => String(name).trim()).filter(Boolean))];
  if (names.length > MAX_EVENTS) throw new BadRequestException(`Pick at most ${MAX_EVENTS} events for ${field}.`);
  const invalid = names.find((name) => !EVENT_NAME_PATTERN.test(name));
  if (invalid) throw new BadRequestException(`"${invalid}" is not a valid event name. System ($) events can't carry revenue.`);
  return names;
}

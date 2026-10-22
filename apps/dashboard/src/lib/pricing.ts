// Mirrors CLOUD_PLAN_CATALOG.pro.price in apps/api/src/modules/billing/plan-catalog.ts.
// The API charges whatever the configured Bachs products bill; these values are
// only for display and must be changed together with those products.
export const PRO_PRICE = {
  monthlyUsd: 9,
  yearlyUsd: 90
} as const;

export type BillingInterval = 'monthly' | 'yearly';

export const PRO_YEARLY_PER_MONTH_USD = PRO_PRICE.yearlyUsd / 12;
export const PRO_YEARLY_SAVINGS_USD = PRO_PRICE.monthlyUsd * 12 - PRO_PRICE.yearlyUsd;
export const PRO_YEARLY_SAVINGS_PERCENT = Math.round((PRO_YEARLY_SAVINGS_USD / (PRO_PRICE.monthlyUsd * 12)) * 100);

export function formatUsd(amount: number) {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function proPriceLabel(interval: BillingInterval) {
  return interval === 'yearly' ? `${formatUsd(PRO_PRICE.yearlyUsd)}/year` : `${formatUsd(PRO_PRICE.monthlyUsd)}/month`;
}

/** Formats a provider amount such as "19.000000" for a subscription's interval. */
export function subscriptionPriceLabel(amount: string | null | undefined, currency: string | null | undefined, interval: BillingInterval | null) {
  const value = amount === null || amount === undefined ? Number.NaN : Number(amount);
  if (!interval) return null;
  if (!Number.isFinite(value) || value <= 0 || (currency && currency.toUpperCase() !== 'USD')) return proPriceLabel(interval);
  return `${formatUsd(value)}/${interval === 'yearly' ? 'year' : 'month'}`;
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

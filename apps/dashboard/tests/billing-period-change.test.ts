import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/app/dashboard/settings/billing/BillingPanel.tsx', import.meta.url),
  'utf8'
);

describe('scheduled yearly billing UI', () => {
  it('describes an interval change as scheduled for renewal', () => {
    expect(source).toContain('Yearly billing scheduled');
    expect(source).toContain('Your plan will switch to yearly on your next renewal.');
    expect(source).toContain('Switch to yearly at renewal');
    expect(source).toContain('billingChange.effectiveAt');
    expect(source).toContain('Intl.DateTimeFormat');
  });

  it('does not imply an immediate prorated upgrade', () => {
    expect(source).not.toContain('Upgrading to yearly');
    expect(source).not.toContain('prorated payment');
    expect(source).not.toContain("setInterval(() =>");
  });
});

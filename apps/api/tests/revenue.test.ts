import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RevenueService } from '../src/modules/revenue/revenue.service';
import { DEFAULT_REVENUE_SETTINGS, normalizeRevenueSettings, suggestRevenueRole } from '../src/modules/revenue/revenue.util';
import { mockDatabase, rows } from './helpers/mock-db';

const project = { id: 'proj_1', name: 'Nuwell', slug: 'nuwell', organizationId: 'org_1', organizationName: 'Org', role: 'owner' };
const user = { id: 'usr_1', email: 'a@b.co', authMethod: 'session' };

function makeService(onQuery: Parameters<typeof mockDatabase>[0]) {
  const db = mockDatabase(onQuery);
  const projects = {
    requireActiveProject: vi.fn().mockResolvedValue(project),
    requireWritableProject: vi.fn().mockResolvedValue(project)
  };
  return { db, projects, service: new RevenueService(db as never, projects as never) };
}

describe('revenue settings validation', () => {
  it('requires a success event before revenue can be turned on', () => {
    expect(() => normalizeRevenueSettings({ enabled: true }, DEFAULT_REVENUE_SETTINGS)).toThrow(BadRequestException);
    expect(normalizeRevenueSettings({ enabled: true, successEvents: ['payment_succeeded'] }, DEFAULT_REVENUE_SETTINGS)).toMatchObject({
      enabled: true,
      successEvents: ['payment_succeeded']
    });
  });

  it('rejects an event in both lists, system events, and bad currencies', () => {
    const base = { successEvents: ['paid'] };
    expect(() => normalizeRevenueSettings({ ...base, failedEvents: ['paid'] }, DEFAULT_REVENUE_SETTINGS)).toThrow('both');
    expect(() => normalizeRevenueSettings({ successEvents: ['$pageview'] }, DEFAULT_REVENUE_SETTINGS)).toThrow('System');
    expect(() => normalizeRevenueSettings({ ...base, currency: 'naira' }, DEFAULT_REVENUE_SETTINGS)).toThrow('3-letter');
    expect(() => normalizeRevenueSettings({ ...base, amountProperty: 'amount; drop' }, DEFAULT_REVENUE_SETTINGS)).toThrow('Amount property');
  });

  it('trims, dedupes and upper-cases', () => {
    expect(
      normalizeRevenueSettings({ successEvents: [' paid ', 'paid', ''], currency: 'ngn' }, DEFAULT_REVENUE_SETTINGS)
    ).toMatchObject({ successEvents: ['paid'], currency: 'NGN' });
  });
});

describe('suggestRevenueRole', () => {
  it('suggests completed payments as success and payment failures as failed', () => {
    expect(suggestRevenueRole('subscription_purchased', true)).toBe('success');
    expect(suggestRevenueRole('payment_succeeded', true)).toBe('success');
    expect(suggestRevenueRole('subscription_purchase_failed', false)).toBe('failed');
    expect(suggestRevenueRole('checkout_failed', false)).toBe('failed');
  });

  it('leaves intent, unpaid and unrelated events alone', () => {
    expect(suggestRevenueRole('checkout_started', true)).toBeNull();
    expect(suggestRevenueRole('premium_plan_selected', true)).toBeNull();
    expect(suggestRevenueRole('payment_gateway_returned', false)).toBeNull();
    expect(suggestRevenueRole('subscription_purchased', false)).toBeNull();
    expect(suggestRevenueRole('login_failed', false)).toBeNull();
    expect(suggestRevenueRole('$exception', true)).toBeNull();
  });
});

describe('RevenueService', () => {
  it('lists candidates with suggestions when revenue is not set up', async () => {
    const { service } = makeService((sql) =>
      sql.includes('GROUP BY event_name')
        ? rows([
            { name: 'checkout_started', count: 9, with_amount: 0 },
            { name: 'subscription_purchased', count: 2, with_amount: 2 }
          ])
        : rows([])
    );

    const result = await service.getSettings(user as never);

    expect(result.configured).toBe(false);
    expect(result.summary).toBeNull();
    expect(result.candidates).toEqual([
      { name: 'checkout_started', count: 9, withAmount: 0, suggested: null },
      { name: 'subscription_purchased', count: 2, withAmount: 2, suggested: 'success' }
    ]);
  });

  it('saves settings to the writable project', async () => {
    const { db, projects, service } = makeService(() => rows([]));

    await service.updateSettings(user as never, 'proj_1', {
      enabled: true,
      successEvents: ['subscription_purchased'],
      failedEvents: ['subscription_purchase_failed'],
      currency: 'NGN'
    });

    expect(projects.requireWritableProject).toHaveBeenCalledWith(user, 'proj_1');
    const insert = db.queryCalls('INSERT INTO revenue_settings')[0];
    expect(insert.values).toEqual(['proj_1', true, ['subscription_purchased'], ['subscription_purchase_failed'], 'amount', 'NGN']);
  });
});

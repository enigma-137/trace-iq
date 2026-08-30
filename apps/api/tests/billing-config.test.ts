import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../src/config/app.config';
import { CLOUD_BILLING_POLICY, CLOUD_PLAN_CATALOG, SELF_HOSTED_POLICY } from '../src/modules/billing/plan-catalog';

describe('canonical plan catalogue', () => {
  it('captures the approved Free and Pro plans', () => {
    expect(CLOUD_PLAN_CATALOG.free).toMatchObject({
      price: { monthlyUsd: 0, yearlyUsd: 0 },
      limits: { eventsPerMonth: 50_000, projects: 1, members: 1, retentionDays: 30, aiInsightsPerMonth: 5 },
      features: { publicDashboards: true },
      requiresPaymentMethod: false
    });
    expect(CLOUD_PLAN_CATALOG.pro).toMatchObject({
      price: { monthlyUsd: 19, yearlyUsd: 190 },
      limits: { eventsPerMonth: 1_000_000, projects: 10, members: 5, retentionDays: 365, aiInsightsPerMonth: 100 },
      features: { publicDashboards: true }
    });
    expect(CLOUD_BILLING_POLICY).toMatchObject({
      eventUsageWarningPercentages: [70, 90, 100],
      eventIngestionStopPercentage: 105,
      failedPaymentGraceDays: 7,
      deleteDataOrResourcesForPaymentFailure: false,
      downgradeExcessResourceMode: 'read_only',
      launchedPlans: ['free', 'pro']
    });
    expect(SELF_HOSTED_POLICY).toMatchObject({ priceUsd: 0, unrestricted: true });
  });
});

describe('deployment configuration', () => {
  it('defaults to unrestricted self-hosted mode without Bachs', () => {
    expect(loadAppConfig({})).toMatchObject({ deploymentMode: 'self_hosted', bachs: null, port: 4000 });
  });

  it('ignores incomplete Bachs values in self-hosted mode', () => {
    expect(loadAppConfig({ TRACEIQ_DEPLOYMENT_MODE: 'self_hosted', BACHS_API_KEY: 'invalid' }).bachs).toBeNull();
  });

  it('loads complete Bachs sandbox configuration in cloud mode', () => {
    const config = loadAppConfig({
      TRACEIQ_DEPLOYMENT_MODE: 'cloud',
      BACHS_API_BASE_URL: 'https://sandbox-api.bachs.io',
      BACHS_API_KEY: 'sk_sandbox_example',
      BACHS_WEBHOOK_SECRET: 'whsec_example',
      BACHS_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
      BACHS_PRO_YEARLY_PRODUCT_ID: 'prod_yearly'
    });

    expect(config.bachs).toMatchObject({
      environment: 'sandbox',
      apiBaseUrl: 'https://sandbox-api.bachs.io',
      products: { proMonthly: 'prod_monthly', proYearly: 'prod_yearly' }
    });
  });

  it('rejects incomplete cloud configuration', () => {
    expect(() => loadAppConfig({ TRACEIQ_DEPLOYMENT_MODE: 'cloud' })).toThrow('BACHS_API_BASE_URL is required');
  });

  it('rejects environment and key mismatches', () => {
    expect(() => loadAppConfig({
      TRACEIQ_DEPLOYMENT_MODE: 'cloud',
      BACHS_API_BASE_URL: 'https://api.bachs.io',
      BACHS_API_KEY: 'sk_sandbox_wrong',
      BACHS_WEBHOOK_SECRET: 'secret',
      BACHS_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
      BACHS_PRO_YEARLY_PRODUCT_ID: 'prod_yearly'
    })).toThrow('sk_live_');
  });

  it('rejects unsupported deployment modes and API origins', () => {
    expect(() => loadAppConfig({ TRACEIQ_DEPLOYMENT_MODE: 'hosted' })).toThrow('TRACEIQ_DEPLOYMENT_MODE');
    expect(() => loadAppConfig({
      TRACEIQ_DEPLOYMENT_MODE: 'cloud',
      BACHS_API_BASE_URL: 'https://example.com'
    })).toThrow('BACHS_API_BASE_URL');
  });
});

export type CloudPlanKey = 'free' | 'pro';

export interface CloudPlanDefinition {
  key: CloudPlanKey;
  name: string;
  price: {
    monthlyUsd: number;
    yearlyUsd: number;
  };
  limits: {
    eventsPerMonth: number;
    projects: number;
    members: number;
    retentionDays: number;
    aiInsightsPerMonth: number;
  };
  features: {
    publicDashboards: boolean;
  };
  requiresPaymentMethod: boolean;
}

/**
 * The canonical commercial plan catalogue for TraceIQ Cloud.
 *
 * Provider product IDs intentionally do not live here. Bachs configuration maps
 * its products to these stable internal plan keys at the billing boundary.
 */
export const CLOUD_PLAN_CATALOG: Readonly<Record<CloudPlanKey, Readonly<CloudPlanDefinition>>> = {
  free: {
    key: 'free',
    name: 'Cloud Free',
    price: { monthlyUsd: 0, yearlyUsd: 0 },
    limits: {
      eventsPerMonth: 50_000,
      projects: 1,
      members: 1,
      retentionDays: 30,
      aiInsightsPerMonth: 5
    },
    features: { publicDashboards: true },
    requiresPaymentMethod: false
  },
  pro: {
    key: 'pro',
    name: 'Cloud Pro',
    price: { monthlyUsd: 19, yearlyUsd: 190 },
    limits: {
      eventsPerMonth: 1_000_000,
      projects: 10,
      members: 5,
      retentionDays: 365,
      aiInsightsPerMonth: 100
    },
    features: { publicDashboards: true },
    requiresPaymentMethod: true
  }
};

export const CLOUD_BILLING_POLICY = {
  eventUsageWarningPercentages: [70, 90, 100],
  eventIngestionStopPercentage: 105,
  failedPaymentGraceDays: 7,
  deleteDataOrResourcesForPaymentFailure: false,
  downgradeExcessResourceMode: 'read_only',
  launchedPlans: ['free', 'pro']
} as const;

export const SELF_HOSTED_POLICY = {
  priceUsd: 0,
  unrestricted: true,
  operatorProvidesInfrastructure: true,
  operatorProvidesOptionalApiKeys: true
} as const;


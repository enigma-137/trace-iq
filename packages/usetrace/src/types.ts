export type TraceIQProduct =
  | 'product-analytics'
  | 'web-analytics'
  | 'error-tracking'
  | 'feature-flags'
  | 'revenue-analytics'
  | 'user-identification'
  | 'web-vitals'
  | 'funnels';

export interface ProductOption {
  id: TraceIQProduct;
  name: string;
  description: string;
  defaultSelected: boolean;
}

export const TRACEIQ_PRODUCTS: ProductOption[] = [
  {
    id: 'product-analytics',
    name: 'Product Analytics',
    description: 'Track custom user events, trends, retention, and funnel drop-offs.',
    defaultSelected: true
  },
  {
    id: 'web-analytics',
    name: 'Web Analytics',
    description: 'Automated pageview tracking, visitor sessions, and traffic acquisition.',
    defaultSelected: true
  },
  {
    id: 'error-tracking',
    name: 'Error Tracking',
    description: 'Auto-capture uncaught exceptions, unhandled rejections, and console errors.',
    defaultSelected: true
  },
  {
    id: 'user-identification',
    name: 'User Identification',
    description: 'Identify signed-in users, stitch anonymous sessions, and associate traits.',
    defaultSelected: true
  },
  {
    id: 'feature-flags',
    name: 'Feature Flags',
    description: 'Evaluate rollout flags, variant payloads, and track exposure metrics.',
    defaultSelected: false
  },
  {
    id: 'revenue-analytics',
    name: 'Revenue Analytics',
    description: 'Track purchase, upgrade, subscription, and custom revenue transactions.',
    defaultSelected: false
  },
  {
    id: 'web-vitals',
    name: 'Web Vitals',
    description: 'Capture real-user Core Web Vitals (LCP, FID/INP, CLS, TTFB, FCP).',
    defaultSelected: true
  }
];

export interface SetupState {
  projectName: string;
  framework: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  sdkDetected: boolean;
  sdkVersion?: string;
  providerConfigured: boolean;
  projectKeyConfigured: boolean;
  pageViewsConfigured: boolean;
  userIdentificationConfigured: boolean;
  errorTrackingConfigured: boolean;
  webVitalsConfigured: boolean;
  featureFlagsConfigured: boolean;
  envFiles: string[];
  issues: string[];
  recommendations: string[];
}

export interface SetupChanges {
  createdFiles: string[];
  modifiedFiles: string[];
  addedEnvVars: string[];
  installedPackages: string[];
  diffs: Array<{ path: string; diff: string }>;
}

export interface SetupReport {
  detectedFramework: string;
  detectedSdk: string;
  sdkVersion?: string;
  packageManager: string;
  enabledProducts: string[];
  filesChanged: string[];
  envVarsConfigured: string[];
  verificationStatus: 'verified' | 'failed' | 'skipped' | 'timeout';
  firstVerifiedEvent?: {
    name: string;
    id?: string;
    source?: string;
    host?: string;
    environment?: string;
    timestamp: string;
  };
  warnings: string[];
  recommendations: string[];
}

export interface VerificationSession {
  verificationId: string;
  expiresAt: string;
  projectId: string;
}

export interface VerificationEventResult {
  verificationId: string;
  projectId: string;
  projectName?: string;
  status: 'verified' | 'expired';
  verifiedAt: string;
  event: {
    id: string;
    name: string;
    source?: string;
    environment?: string;
    browser?: string;
    host?: string;
    userId?: string | null;
    anonymousId?: string | null;
    properties?: Record<string, unknown>;
  };
}

export interface CliOptions {
  apiUrl?: string;
  projectId?: string;
  writeKey?: string;
  verbose?: boolean;
  dryRun?: boolean;
  skipVerify?: boolean;
  probe?: boolean;
  timeout?: number;
  cwd?: string;
}

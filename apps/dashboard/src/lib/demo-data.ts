// Mock data for the public live demo at /demo. Everything is generated in the
// browser from the visitor's company name and category, so the demo needs no API,
// database or account. The generator is seeded: the same company sees the same
// numbers on every visit, and changing the range or a filter only reshapes them.

import type { CaptureState, RequestListItem, RequestsSummary } from './requests';

export type DemoCategory = 'saas' | 'ecommerce' | 'fintech' | 'devtools' | 'media' | 'marketplace';
export type DemoRange = '24h' | '7d' | '30d' | '90d';

export interface DemoCompany {
  name: string;
  category: DemoCategory;
}

export const DEMO_RANGES: Array<{ value: DemoRange; label: string; long: string; buckets: number; hourly: boolean }> = [
  { value: '24h', label: '24h', long: '24 hours', buckets: 24, hourly: true },
  { value: '7d', label: '7d', long: '7 days', buckets: 7, hourly: false },
  { value: '30d', label: '30d', long: '30 days', buckets: 30, hourly: false },
  { value: '90d', label: '90d', long: '90 days', buckets: 90, hourly: false }
];

interface DemoRoute {
  method: string;
  route: string;
  service: string;
  /** Typical server time in ms. */
  latency: number;
  /** Share of requests that fail, 0..1. */
  failure: number;
  weight: number;
}

interface DemoFunnelDef {
  id: string;
  name: string;
  description: string;
  steps: Array<{ eventName: string; label: string; keep: number }>;
}

interface CategoryProfile {
  label: string;
  description: string;
  /** Daily visitors at the start of the window. */
  dailyVisitors: number;
  events: Array<{ name: string; weight: number }>;
  funnels: DemoFunnelDef[];
  routes: DemoRoute[];
}

const COMMON_ROUTES: DemoRoute[] = [
  { method: 'GET', route: '/api/health', service: 'api', latency: 4, failure: 0, weight: 4 },
  { method: 'POST', route: '/api/auth/session', service: 'auth', latency: 85, failure: 0.02, weight: 3 },
  { method: 'GET', route: '/api/me', service: 'api', latency: 32, failure: 0.004, weight: 6 }
];

export const DEMO_CATEGORIES: Record<DemoCategory, CategoryProfile> = {
  saas: {
    label: 'SaaS',
    description: 'Subscriptions, workspaces and seats',
    dailyVisitors: 260,
    events: [
      { name: '$pageview', weight: 40 },
      { name: 'workspace_created', weight: 3 },
      { name: 'project_opened', weight: 14 },
      { name: 'invite_sent', weight: 4 },
      { name: 'report_exported', weight: 5 },
      { name: 'plan_upgraded', weight: 1 },
      { name: '$autocapture', weight: 22 }
    ],
    funnels: [
      {
        id: 'signup',
        name: 'Sign-up flow',
        description: 'Homepage through pricing to a confirmed account',
        steps: [
          { eventName: '$pageview', label: 'Landing page', keep: 1 },
          { eventName: 'pricing_viewed', label: 'View pricing', keep: 0.24 },
          { eventName: 'signup_started', label: 'Start sign-up', keep: 0.46 },
          { eventName: 'signup_completed', label: 'Account created', keep: 0.62 }
        ]
      },
      {
        id: 'activation',
        name: 'Activation',
        description: 'New accounts that create a workspace and invite a teammate',
        steps: [
          { eventName: 'signup_completed', label: 'Account created', keep: 1 },
          { eventName: 'workspace_created', label: 'Create workspace', keep: 0.78 },
          { eventName: 'project_opened', label: 'Open first project', keep: 0.71 },
          { eventName: 'invite_sent', label: 'Invite a teammate', keep: 0.34 }
        ]
      },
      {
        id: 'upgrade',
        name: 'Trial to paid',
        description: 'Trial users who reach checkout and upgrade',
        steps: [
          { eventName: 'trial_started', label: 'Start trial', keep: 1 },
          { eventName: 'billing_viewed', label: 'Open billing', keep: 0.41 },
          { eventName: 'checkout_started', label: 'Start checkout', keep: 0.55 },
          { eventName: 'plan_upgraded', label: 'Upgrade plan', keep: 0.68 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/api/workspaces/:id', service: 'api', latency: 48, failure: 0.006, weight: 8 },
      { method: 'GET', route: '/api/projects', service: 'api', latency: 64, failure: 0.008, weight: 9 },
      { method: 'POST', route: '/api/projects/:id/reports', service: 'reports', latency: 420, failure: 0.03, weight: 3 },
      { method: 'POST', route: '/api/invites', service: 'api', latency: 120, failure: 0.015, weight: 2 },
      { method: 'POST', route: '/api/billing/checkout', service: 'billing', latency: 380, failure: 0.025, weight: 1 },
      { method: 'PATCH', route: '/api/workspaces/:id/settings', service: 'api', latency: 70, failure: 0.01, weight: 2 }
    ]
  },
  ecommerce: {
    label: 'E-commerce',
    description: 'Catalog, cart and checkout',
    dailyVisitors: 1400,
    events: [
      { name: '$pageview', weight: 46 },
      { name: 'product_viewed', weight: 22 },
      { name: 'search_performed', weight: 9 },
      { name: 'add_to_cart', weight: 6 },
      { name: 'checkout_started', weight: 2 },
      { name: 'order_completed', weight: 1 },
      { name: '$autocapture', weight: 18 }
    ],
    funnels: [
      {
        id: 'purchase',
        name: 'Purchase',
        description: 'Product page through cart to a completed order',
        steps: [
          { eventName: 'product_viewed', label: 'View product', keep: 1 },
          { eventName: 'add_to_cart', label: 'Add to cart', keep: 0.18 },
          { eventName: 'checkout_started', label: 'Start checkout', keep: 0.52 },
          { eventName: 'order_completed', label: 'Complete order', keep: 0.64 }
        ]
      },
      {
        id: 'search',
        name: 'Search to cart',
        description: 'Visitors who search and add a result to their cart',
        steps: [
          { eventName: 'search_performed', label: 'Search', keep: 1 },
          { eventName: 'search_result_clicked', label: 'Click a result', keep: 0.58 },
          { eventName: 'add_to_cart', label: 'Add to cart', keep: 0.22 }
        ]
      },
      {
        id: 'newsletter',
        name: 'Newsletter sign-up',
        description: 'Home page visitors who join the mailing list',
        steps: [
          { eventName: '$pageview', label: 'Home page', keep: 1 },
          { eventName: 'newsletter_opened', label: 'Open sign-up form', keep: 0.09 },
          { eventName: 'newsletter_joined', label: 'Join list', keep: 0.47 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/api/products', service: 'catalog', latency: 58, failure: 0.004, weight: 14 },
      { method: 'GET', route: '/api/products/:slug', service: 'catalog', latency: 41, failure: 0.004, weight: 16 },
      { method: 'GET', route: '/api/search', service: 'search', latency: 140, failure: 0.012, weight: 8 },
      { method: 'POST', route: '/api/cart/items', service: 'cart', latency: 66, failure: 0.01, weight: 5 },
      { method: 'POST', route: '/api/checkout', service: 'checkout', latency: 610, failure: 0.035, weight: 2 },
      { method: 'POST', route: '/api/payments/intent', service: 'payments', latency: 520, failure: 0.03, weight: 2 }
    ]
  },
  fintech: {
    label: 'Fintech',
    description: 'Accounts, transfers and verification',
    dailyVisitors: 520,
    events: [
      { name: '$pageview', weight: 34 },
      { name: 'balance_viewed', weight: 20 },
      { name: 'transfer_started', weight: 6 },
      { name: 'transfer_completed', weight: 5 },
      { name: 'kyc_submitted', weight: 1 },
      { name: 'card_frozen', weight: 1 },
      { name: '$autocapture', weight: 20 }
    ],
    funnels: [
      {
        id: 'onboarding',
        name: 'Account opening',
        description: 'Sign-up through identity verification to a funded account',
        steps: [
          { eventName: 'signup_started', label: 'Start sign-up', keep: 1 },
          { eventName: 'kyc_submitted', label: 'Submit ID', keep: 0.61 },
          { eventName: 'kyc_approved', label: 'ID approved', keep: 0.83 },
          { eventName: 'account_funded', label: 'First deposit', keep: 0.49 }
        ]
      },
      {
        id: 'transfer',
        name: 'Transfer',
        description: 'Transfers started and confirmed',
        steps: [
          { eventName: 'transfer_started', label: 'Start transfer', keep: 1 },
          { eventName: 'transfer_reviewed', label: 'Review details', keep: 0.88 },
          { eventName: 'transfer_completed', label: 'Confirm', keep: 0.93 }
        ]
      },
      {
        id: 'card',
        name: 'Card activation',
        description: 'Physical card ordered and activated',
        steps: [
          { eventName: 'card_ordered', label: 'Order card', keep: 1 },
          { eventName: 'card_shipped', label: 'Card shipped', keep: 0.97 },
          { eventName: 'card_activated', label: 'Activate card', keep: 0.72 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/api/accounts/:id/balance', service: 'ledger', latency: 36, failure: 0.003, weight: 14 },
      { method: 'GET', route: '/api/accounts/:id/transactions', service: 'ledger', latency: 88, failure: 0.006, weight: 10 },
      { method: 'POST', route: '/api/transfers', service: 'payments', latency: 340, failure: 0.02, weight: 4 },
      { method: 'POST', route: '/api/kyc/documents', service: 'kyc', latency: 900, failure: 0.05, weight: 1 },
      { method: 'POST', route: '/api/cards/:id/freeze', service: 'cards', latency: 110, failure: 0.01, weight: 1 }
    ]
  },
  devtools: {
    label: 'Developer tools',
    description: 'API keys, docs and deployments',
    dailyVisitors: 340,
    events: [
      { name: '$pageview', weight: 42 },
      { name: 'docs_viewed', weight: 18 },
      { name: 'api_key_created', weight: 2 },
      { name: 'deploy_triggered', weight: 7 },
      { name: 'cli_installed', weight: 3 },
      { name: 'copy_snippet', weight: 9 },
      { name: '$autocapture', weight: 19 }
    ],
    funnels: [
      {
        id: 'docs',
        name: 'Docs to first call',
        description: 'Docs readers who create a key and make their first API call',
        steps: [
          { eventName: 'docs_viewed', label: 'Read the quickstart', keep: 1 },
          { eventName: 'signup_completed', label: 'Sign up', keep: 0.21 },
          { eventName: 'api_key_created', label: 'Create API key', keep: 0.74 },
          { eventName: 'first_api_call', label: 'First API call', keep: 0.58 }
        ]
      },
      {
        id: 'deploy',
        name: 'First deploy',
        description: 'New projects that connect a repo and deploy',
        steps: [
          { eventName: 'project_created', label: 'Create project', keep: 1 },
          { eventName: 'repo_connected', label: 'Connect repository', keep: 0.69 },
          { eventName: 'deploy_triggered', label: 'Trigger deploy', keep: 0.81 },
          { eventName: 'deploy_succeeded', label: 'Deploy succeeds', keep: 0.88 }
        ]
      },
      {
        id: 'pricing',
        name: 'Pricing to team plan',
        description: 'Pricing page visitors who upgrade to a team plan',
        steps: [
          { eventName: 'pricing_viewed', label: 'View pricing', keep: 1 },
          { eventName: 'checkout_started', label: 'Start checkout', keep: 0.12 },
          { eventName: 'plan_upgraded', label: 'Upgrade', keep: 0.63 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/v1/projects', service: 'api', latency: 52, failure: 0.005, weight: 10 },
      { method: 'POST', route: '/v1/deployments', service: 'builder', latency: 760, failure: 0.04, weight: 4 },
      { method: 'GET', route: '/v1/deployments/:id/logs', service: 'builder', latency: 180, failure: 0.01, weight: 6 },
      { method: 'POST', route: '/v1/keys', service: 'api', latency: 95, failure: 0.008, weight: 1 },
      { method: 'DELETE', route: '/v1/keys/:id', service: 'api', latency: 60, failure: 0.005, weight: 1 },
      { method: 'POST', route: '/v1/webhooks/github', service: 'integrations', latency: 140, failure: 0.02, weight: 5 }
    ]
  },
  media: {
    label: 'Media & content',
    description: 'Articles, subscriptions and engagement',
    dailyVisitors: 2100,
    events: [
      { name: '$pageview', weight: 52 },
      { name: 'article_read', weight: 24 },
      { name: 'video_played', weight: 8 },
      { name: 'article_shared', weight: 3 },
      { name: 'paywall_shown', weight: 4 },
      { name: 'subscription_started', weight: 1 },
      { name: '$autocapture', weight: 14 }
    ],
    funnels: [
      {
        id: 'subscribe',
        name: 'Paywall to subscriber',
        description: 'Readers who hit the paywall and subscribe',
        steps: [
          { eventName: 'article_read', label: 'Read an article', keep: 1 },
          { eventName: 'paywall_shown', label: 'Hit the paywall', keep: 0.19 },
          { eventName: 'plans_viewed', label: 'View plans', keep: 0.27 },
          { eventName: 'subscription_started', label: 'Subscribe', keep: 0.31 }
        ]
      },
      {
        id: 'newsletter',
        name: 'Newsletter',
        description: 'Readers who join the daily newsletter',
        steps: [
          { eventName: 'article_read', label: 'Read an article', keep: 1 },
          { eventName: 'newsletter_opened', label: 'Open sign-up', keep: 0.07 },
          { eventName: 'newsletter_joined', label: 'Join', keep: 0.56 }
        ]
      },
      {
        id: 'video',
        name: 'Video completion',
        description: 'Plays that reach the end of the video',
        steps: [
          { eventName: 'video_played', label: 'Play', keep: 1 },
          { eventName: 'video_25', label: 'Watch 25%', keep: 0.71 },
          { eventName: 'video_75', label: 'Watch 75%', keep: 0.52 },
          { eventName: 'video_completed', label: 'Finish', keep: 0.77 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/api/articles/:slug', service: 'content', latency: 38, failure: 0.003, weight: 20 },
      { method: 'GET', route: '/api/feed', service: 'content', latency: 96, failure: 0.006, weight: 12 },
      { method: 'GET', route: '/api/videos/:id/manifest', service: 'media', latency: 70, failure: 0.01, weight: 6 },
      { method: 'POST', route: '/api/subscriptions', service: 'billing', latency: 450, failure: 0.03, weight: 1 },
      { method: 'POST', route: '/api/comments', service: 'community', latency: 130, failure: 0.015, weight: 2 }
    ]
  },
  marketplace: {
    label: 'Marketplace',
    description: 'Listings, buyers and sellers',
    dailyVisitors: 880,
    events: [
      { name: '$pageview', weight: 44 },
      { name: 'listing_viewed', weight: 21 },
      { name: 'search_performed', weight: 10 },
      { name: 'message_sent', weight: 4 },
      { name: 'listing_created', weight: 2 },
      { name: 'booking_confirmed', weight: 1 },
      { name: '$autocapture', weight: 18 }
    ],
    funnels: [
      {
        id: 'booking',
        name: 'Booking',
        description: 'Search through listing to a confirmed booking',
        steps: [
          { eventName: 'search_performed', label: 'Search', keep: 1 },
          { eventName: 'listing_viewed', label: 'View listing', keep: 0.63 },
          { eventName: 'message_sent', label: 'Message host', keep: 0.14 },
          { eventName: 'booking_confirmed', label: 'Confirm booking', keep: 0.39 }
        ]
      },
      {
        id: 'seller',
        name: 'Seller onboarding',
        description: 'New sellers who publish their first listing',
        steps: [
          { eventName: 'seller_signup', label: 'Sign up as seller', keep: 1 },
          { eventName: 'payout_connected', label: 'Connect payouts', keep: 0.57 },
          { eventName: 'listing_created', label: 'Draft a listing', keep: 0.76 },
          { eventName: 'listing_published', label: 'Publish listing', keep: 0.69 }
        ]
      },
      {
        id: 'review',
        name: 'Post-stay review',
        description: 'Completed bookings that leave a review',
        steps: [
          { eventName: 'booking_completed', label: 'Booking completed', keep: 1 },
          { eventName: 'review_prompted', label: 'Review prompt opened', keep: 0.62 },
          { eventName: 'review_submitted', label: 'Review submitted', keep: 0.48 }
        ]
      }
    ],
    routes: [
      ...COMMON_ROUTES,
      { method: 'GET', route: '/api/listings', service: 'listings', latency: 82, failure: 0.005, weight: 14 },
      { method: 'GET', route: '/api/listings/:id', service: 'listings', latency: 44, failure: 0.004, weight: 12 },
      { method: 'GET', route: '/api/search', service: 'search', latency: 160, failure: 0.012, weight: 9 },
      { method: 'POST', route: '/api/messages', service: 'messaging', latency: 90, failure: 0.01, weight: 4 },
      { method: 'POST', route: '/api/bookings', service: 'bookings', latency: 480, failure: 0.03, weight: 2 }
    ]
  }
};

export const DEMO_CATEGORY_OPTIONS = (Object.keys(DEMO_CATEGORIES) as DemoCategory[]).map((value) => ({
  value,
  label: DEMO_CATEGORIES[value].label,
  description: DEMO_CATEGORIES[value].description
}));

export function isDemoCategory(value: unknown): value is DemoCategory {
  return typeof value === 'string' && value in DEMO_CATEGORIES;
}

/** Trims and bounds a typed company name; empty input falls back to a sample name. */
export function normalizeCompanyName(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 40);
  return trimmed || 'Acme Inc.';
}

/** URL-safe host for the company, used in referrers and request URLs. */
export function companyDomain(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return `${slug || 'acme'}.com`;
}

// ── Seeded randomness ──

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(company: DemoCompany, salt: string): string {
  return `${company.name.toLowerCase()}|${company.category}|${salt}`;
}

function pickWeighted<T extends { weight: number }>(items: T[], rand: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function rangeInfo(range: DemoRange) {
  return DEMO_RANGES.find((option) => option.value === range) ?? DEMO_RANGES[2];
}

// ── Traffic series ──

export interface DemoSeriesPoint {
  /** ISO start of the bucket. */
  bucket: string;
  pageviews: number;
  visitors: number;
  sessions: number;
  apiCalls: number;
  errors: number;
}

/**
 * Visitors per bucket: a slow upward trend, weekday/diurnal seasonality, noise,
 * and one launch-day spike so the charts have a story to tell.
 */
export function buildSeries(company: DemoCompany, range: DemoRange, now: Date, period: 'current' | 'previous' = 'current'): DemoSeriesPoint[] {
  const info = rangeInfo(range);
  const profile = DEMO_CATEGORIES[company.category];
  const previous = period === 'previous';
  const rand = seededRandom(seedFor(company, `series:${range}${previous ? ':previous' : ''}`));
  const stepMs = info.hourly ? 3_600_000 : 86_400_000;
  // The previous window ends where the current one starts, at a lower level so the
  // growth story continues across the comparison.
  const end = new Date((info.hourly ? floorToHour(now) : floorToDay(now)).getTime() - (previous ? info.buckets * stepMs : 0));
  const level = previous ? 0.68 : 1;
  const spikeAt = Math.floor(info.buckets * (0.2 + rand() * 0.25));
  const points: DemoSeriesPoint[] = [];

  for (let i = 0; i < info.buckets; i += 1) {
    const at = new Date(end.getTime() - (info.buckets - 1 - i) * stepMs);
    const trend = 1 + (i / Math.max(1, info.buckets - 1)) * 0.45;
    const seasonal = info.hourly ? diurnal(at.getUTCHours()) : weekday(at.getUTCDay());
    const noise = 0.82 + rand() * 0.36;
    const distance = i - spikeAt;
    const spike = distance >= 0 && distance < 4 ? [3.4, 1.9, 1.35, 1.1][distance] : 1;
    const base = info.hourly ? profile.dailyVisitors / 16 : profile.dailyVisitors;
    const visitors = Math.max(1, Math.round(base * level * trend * seasonal * noise * spike));
    const sessions = Math.round(visitors * (1.12 + rand() * 0.12));
    const pageviews = Math.round(sessions * (1.35 + rand() * 0.35));
    const apiCalls = Math.round(pageviews * (2.6 + rand() * 0.8));
    const errors = Math.round(apiCalls * (0.004 + rand() * 0.006) * (distance === 0 ? 2.6 : 1));
    points.push({ bucket: at.toISOString(), pageviews, visitors, sessions, apiCalls, errors });
  }
  return points;
}

function diurnal(hour: number): number {
  // Quiet overnight, peaks mid-afternoon UTC.
  return 0.35 + 0.65 * Math.max(0, Math.sin(((hour - 5) / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
}

function weekday(day: number): number {
  return day === 0 || day === 6 ? 0.72 : 1;
}

function floorToHour(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}

function floorToDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function sum(points: DemoSeriesPoint[], key: keyof Omit<DemoSeriesPoint, 'bucket'>): number {
  return points.reduce((total, point) => total + point[key], 0);
}

/** Percent change between the first and second half of a series. */
export function halfOverHalf(values: number[]): number {
  if (values.length < 2) return 0;
  const middle = Math.floor(values.length / 2);
  const first = values.slice(0, middle).reduce((a, b) => a + b, 0);
  const second = values.slice(values.length - middle).reduce((a, b) => a + b, 0);
  if (first === 0) return 0;
  return Math.round(((second - first) / first) * 100);
}

// ── Overview ──

export interface DemoBreakdownRow {
  label: string;
  visitors: number;
  views: number;
}

export interface DemoOverview {
  series: DemoSeriesPoint[];
  totals: { pageviews: number; visitors: number; sessions: number; apiCalls: number; errors: number };
  bounceRate: number;
  bounceSeries: number[];
  avgSessionSec: number;
  /** The window before this one, for the comparison cards. */
  previous: { pageviews: number; visitors: number; sessions: number; bounceRate: number; avgSessionSec: number; p95: number };
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  errorRate: number;
  latencySeries: Array<{ bucket: string; p50: number; p90: number; p99: number }>;
  statusBreakdown: { ok200: number; rateLimit429: number; error500: number; other: number };
  topEvents: Array<{ eventName: string; total: number }>;
  devices: DemoBreakdownRow[];
  browsers: DemoBreakdownRow[];
  operatingSystems: DemoBreakdownRow[];
  countries: Array<{ code: string; name: string; visitors: number }>;
  sources: Array<{ name: string; domain: string | null; kind: 'direct' | 'search' | 'social' | 'referral' | 'ai'; visitors: number; views: number }>;
  /** Individual referring sites, for the Referrers tab. */
  referrers: Array<{ domain: string; visitors: number; views: number }>;
  utmSources: Array<{ name: string; visitors: number; views: number }>;
  utmCampaigns: Array<{ name: string; visitors: number; views: number }>;
  pages: Array<{ path: string; visitors: number; views: number; avgSeconds: number }>;
}

const SOURCE_SHARES: Array<{ name: string; domain: string | null; kind: DemoOverview['sources'][number]['kind']; share: number }> = [
  { name: 'Direct', domain: null, kind: 'direct', share: 0.46 },
  { name: 'Google', domain: 'google.com', kind: 'search', share: 0.19 },
  { name: 'X (Twitter)', domain: 'x.com', kind: 'social', share: 0.1 },
  { name: 'LinkedIn', domain: 'linkedin.com', kind: 'social', share: 0.06 },
  { name: 'Hacker News', domain: 'news.ycombinator.com', kind: 'referral', share: 0.05 },
  { name: 'GitHub', domain: 'github.com', kind: 'referral', share: 0.035 },
  { name: 'Reddit', domain: 'reddit.com', kind: 'social', share: 0.03 },
  { name: 'ChatGPT', domain: 'chatgpt.com', kind: 'ai', share: 0.022 },
  { name: 'Perplexity', domain: 'perplexity.ai', kind: 'ai', share: 0.012 },
  { name: 'Bing', domain: 'bing.com', kind: 'search', share: 0.011 },
  { name: 'Claude', domain: 'claude.ai', kind: 'ai', share: 0.008 },
  { name: 'DuckDuckGo', domain: 'duckduckgo.com', kind: 'search', share: 0.006 }
];

// Sites without a bundled logo, so the Referrers tab shows fetched favicons too.
const REFERRER_SHARES: Array<{ domain: string; share: number }> = [
  { domain: 'news.ycombinator.com', share: 0.05 },
  { domain: 't.co', share: 0.045 },
  { domain: 'producthunt.com', share: 0.02 },
  { domain: 'dev.to', share: 0.012 },
  { domain: 'medium.com', share: 0.01 },
  { domain: 'indiehackers.com', share: 0.008 },
  { domain: 'stripe.com', share: 0.006 },
  { domain: 'vercel.com', share: 0.005 },
  { domain: 'notion.so', share: 0.004 },
  { domain: 'figma.com', share: 0.003 }
];

const COUNTRY_SHARES: Array<{ code: string; name: string; share: number }> = [
  { code: 'US', name: 'United States', share: 0.34 },
  { code: 'GB', name: 'United Kingdom', share: 0.1 },
  { code: 'DE', name: 'Germany', share: 0.08 },
  { code: 'IN', name: 'India', share: 0.08 },
  { code: 'NG', name: 'Nigeria', share: 0.06 },
  { code: 'CA', name: 'Canada', share: 0.05 },
  { code: 'FR', name: 'France', share: 0.045 },
  { code: 'BR', name: 'Brazil', share: 0.04 },
  { code: 'NL', name: 'Netherlands', share: 0.03 },
  { code: 'AU', name: 'Australia', share: 0.03 }
];

function spread<T extends { share: number }>(items: T[], total: number, rand: () => number): Array<T & { value: number }> {
  return items
    .map((item) => ({ ...item, value: Math.max(1, Math.round(total * item.share * (0.8 + rand() * 0.4))) }))
    .sort((a, b) => b.value - a.value);
}

function pagesFor(company: DemoCompany): string[] {
  const shared = ['/', '/pricing', '/blog', '/about', '/login'];
  const byCategory: Record<DemoCategory, string[]> = {
    saas: ['/features', '/app/projects', '/app/reports', '/signup', '/changelog'],
    ecommerce: ['/products', '/products/linen-shirt', '/cart', '/checkout', '/collections/new'],
    fintech: ['/accounts', '/transfers', '/cards', '/signup', '/security'],
    devtools: ['/docs', '/docs/quickstart', '/dashboard', '/changelog', '/docs/api'],
    media: ['/news', '/articles/ai-weekly', '/videos', '/subscribe', '/opinion'],
    marketplace: ['/search', '/listings/lakeside-cabin', '/host', '/bookings', '/messages']
  };
  return [...byCategory[company.category], ...shared];
}

export function buildOverview(company: DemoCompany, range: DemoRange, now: Date): DemoOverview {
  const profile = DEMO_CATEGORIES[company.category];
  const rand = seededRandom(seedFor(company, `overview:${range}`));
  const series = buildSeries(company, range, now);
  const totals = {
    pageviews: sum(series, 'pageviews'),
    visitors: sum(series, 'visitors'),
    sessions: sum(series, 'sessions'),
    apiCalls: sum(series, 'apiCalls'),
    errors: sum(series, 'errors')
  };

  const baseLatency = profile.routes.reduce((total, route) => total + route.latency * route.weight, 0) /
    profile.routes.reduce((total, route) => total + route.weight, 0);
  const p50 = Math.round(baseLatency * (0.7 + rand() * 0.2));
  const p90 = Math.round(p50 * (2.4 + rand() * 0.6));
  const p95 = Math.round(p90 * (1.25 + rand() * 0.2));
  const p99 = Math.round(p95 * (1.8 + rand() * 0.5));
  const latencySeries = series.map((point) => {
    const load = point.apiCalls / Math.max(1, totals.apiCalls / series.length);
    const jitter = 0.85 + rand() * 0.3;
    return {
      bucket: point.bucket,
      p50: Math.round(p50 * jitter * (0.9 + load * 0.1)),
      p90: Math.round(p90 * jitter * (0.85 + load * 0.15)),
      p99: Math.round(p99 * jitter * (0.8 + load * 0.2))
    };
  });

  const rateLimited = Math.round(totals.apiCalls * (0.003 + rand() * 0.004));
  const otherFailures = Math.round(totals.apiCalls * (0.012 + rand() * 0.01));
  const statusBreakdown = {
    ok200: totals.apiCalls - totals.errors - rateLimited - otherFailures,
    rateLimit429: rateLimited,
    error500: totals.errors,
    other: otherFailures
  };

  const eventTotal = totals.pageviews * 2.1;
  const weightTotal = profile.events.reduce((total, event) => total + event.weight, 0);
  const topEvents = profile.events
    .map((event) => ({
      eventName: event.name,
      total: event.name === '$pageview' ? totals.pageviews : Math.round((eventTotal * event.weight * (0.85 + rand() * 0.3)) / weightTotal)
    }))
    .sort((a, b) => b.total - a.total);

  const bounceRate = Math.round((38 + rand() * 18) * 10) / 10;
  const bounceSeries = series.map(() => Math.round((bounceRate + (rand() - 0.5) * 12) * 10) / 10);

  const mobileShare = company.category === 'media' || company.category === 'ecommerce' ? 0.58 : 0.34;
  const breakdown = (rows: Array<{ label: string; share: number }>): DemoBreakdownRow[] =>
    spread(rows, totals.visitors, rand).map(({ label, value }) => ({
      label,
      visitors: value,
      views: Math.round(value * (totals.pageviews / Math.max(1, totals.visitors)) * (0.85 + rand() * 0.3))
    }));
  const desktop = 1 - mobileShare - 0.05;
  const devices = breakdown([
    { label: 'Desktop', share: desktop },
    { label: 'Mobile', share: mobileShare },
    { label: 'Tablet', share: 0.05 }
  ]);
  const browsers = breakdown([
    { label: 'Chrome', share: desktop * 0.66 },
    { label: 'Mobile Safari', share: mobileShare * 0.5 },
    { label: 'Mobile Chrome', share: mobileShare * 0.38 },
    { label: 'Safari', share: desktop * 0.14 },
    { label: 'Edge', share: desktop * 0.1 },
    { label: 'Firefox', share: desktop * 0.07 },
    { label: 'Samsung Internet', share: mobileShare * 0.08 },
    { label: 'Opera', share: desktop * 0.02 },
    { label: 'Brave', share: desktop * 0.01 }
  ]);
  const operatingSystems = breakdown([
    { label: 'macOS', share: desktop * 0.46 },
    { label: 'Windows', share: desktop * 0.42 },
    { label: 'iOS', share: mobileShare * 0.55 + 0.04 },
    { label: 'Android', share: mobileShare * 0.45 + 0.01 },
    { label: 'Linux', share: desktop * 0.07 },
    { label: 'Ubuntu', share: desktop * 0.03 },
    { label: 'Chrome OS', share: desktop * 0.02 }
  ]);

  const countries = spread(COUNTRY_SHARES, totals.visitors, rand).map(({ code, name, value }) => ({ code, name, visitors: value }));

  const sources = spread(SOURCE_SHARES, totals.visitors, rand).map(({ name, domain, kind, value }) => ({
    name,
    domain,
    kind,
    visitors: value,
    views: Math.round(value * (1.3 + rand() * 0.6))
  }));

  const referrers = spread(REFERRER_SHARES, totals.visitors, rand).map(({ domain, value }) => ({
    domain,
    visitors: value,
    views: Math.round(value * (1.3 + rand() * 0.6))
  }));

  const utmSources = spread(
    [
      { name: 'newsletter', share: 0.05 },
      { name: 'producthunt', share: 0.03 },
      { name: 'x', share: 0.025 },
      { name: 'linkedin', share: 0.018 },
      { name: 'partner', share: 0.009 }
    ],
    totals.visitors,
    rand
  ).map(({ name, value }) => ({ name, visitors: value, views: Math.round(value * (1.4 + rand() * 0.5)) }));

  const utmCampaigns = spread(
    [
      { name: 'launch-week', share: 0.045 },
      { name: 'spring-promo', share: 0.022 },
      { name: 'webinar-q3', share: 0.012 },
      { name: 'retargeting', share: 0.008 }
    ],
    totals.visitors,
    rand
  ).map(({ name, value }) => ({ name, visitors: value, views: Math.round(value * (1.4 + rand() * 0.5)) }));

  const pages = pagesFor(company)
    .map((path, index) => {
      const visitors = Math.max(3, Math.round((totals.visitors * 0.6) / (index + 1.4) * (0.8 + rand() * 0.4)));
      return { path, visitors, views: Math.round(visitors * (1.2 + rand() * 0.8)), avgSeconds: Math.round(18 + rand() * 140) };
    })
    .sort((a, b) => b.views - a.views);

  const avgSessionSec = Math.round(70 + rand() * 160);
  // Its own stream, so adding the comparison didn't change any current-period number.
  const previousRand = seededRandom(seedFor(company, `overview:${range}:previous`));
  const previousSeries = buildSeries(company, range, now, 'previous');
  const previous = {
    pageviews: sum(previousSeries, 'pageviews'),
    visitors: sum(previousSeries, 'visitors'),
    sessions: sum(previousSeries, 'sessions'),
    bounceRate: Math.round((bounceRate + (previousRand() - 0.4) * 8) * 10) / 10,
    avgSessionSec: Math.round(avgSessionSec * (0.75 + previousRand() * 0.35)),
    p95: Math.round(p95 * (0.85 + previousRand() * 0.35))
  };

  return {
    series,
    totals,
    bounceRate,
    bounceSeries,
    avgSessionSec,
    previous,
    p50,
    p90,
    p95,
    p99,
    errorRate: Math.round(((totals.errors + otherFailures) / Math.max(1, totals.apiCalls)) * 1000) / 10,
    latencySeries,
    statusBreakdown,
    topEvents,
    devices,
    browsers,
    operatingSystems,
    countries,
    sources,
    referrers,
    utmSources,
    utmCampaigns,
    pages
  };
}

// ── Funnels ──

export interface DemoFunnelStep {
  order: number;
  eventName: string;
  label: string | null;
  count: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
}

export interface DemoFunnelResult {
  id: string;
  name: string;
  description: string;
  steps: DemoFunnelStep[];
  conversion: number;
  /** Median time from first to last step, in seconds. */
  medianSeconds: number;
  /** Users entering the funnel per bucket, for the sparkline. */
  entrySeries: number[];
  conversionSeries: number[];
}

export const DEMO_FUNNEL_SOURCES = ['All sources', 'Direct', 'Google', 'X (Twitter)', 'LinkedIn', 'Hacker News'] as const;
export type DemoFunnelSource = (typeof DEMO_FUNNEL_SOURCES)[number];

/** How a traffic source converts relative to the average visitor. */
const SOURCE_QUALITY: Record<DemoFunnelSource, { share: number; quality: number }> = {
  'All sources': { share: 1, quality: 1 },
  Direct: { share: 0.46, quality: 1.15 },
  Google: { share: 0.19, quality: 1.05 },
  'X (Twitter)': { share: 0.1, quality: 0.7 },
  LinkedIn: { share: 0.06, quality: 0.95 },
  'Hacker News': { share: 0.05, quality: 0.6 }
};

export function demoFunnels(company: DemoCompany): Array<{ id: string; name: string; description: string; stepCount: number }> {
  return DEMO_CATEGORIES[company.category].funnels.map(({ id, name, description, steps }) => ({
    id,
    name,
    description,
    stepCount: steps.length
  }));
}

export function buildFunnel(
  company: DemoCompany,
  funnelId: string,
  range: DemoRange,
  source: DemoFunnelSource,
  now: Date
): DemoFunnelResult | null {
  const definition = DEMO_CATEGORIES[company.category].funnels.find((funnel) => funnel.id === funnelId);
  if (!definition) return null;
  const rand = seededRandom(seedFor(company, `funnel:${funnelId}:${range}:${source}`));
  const series = buildSeries(company, range, now);
  const { share, quality } = SOURCE_QUALITY[source];
  const entryShare = definition.steps[0].eventName === '$pageview' ? 0.92 : 0.18 + rand() * 0.2;
  const entrySeries = series.map((point) => Math.max(0, Math.round(point.visitors * entryShare * share * (0.85 + rand() * 0.3))));
  const entered = entrySeries.reduce((a, b) => a + b, 0);

  const steps: DemoFunnelStep[] = [];
  let previous = entered;
  definition.steps.forEach((step, index) => {
    const keep = index === 0 ? 1 : Math.min(0.99, step.keep * (0.9 + rand() * 0.2) * (index === 1 ? quality : Math.sqrt(quality)));
    const count = index === 0 ? entered : Math.round(previous * keep);
    steps.push({
      order: index,
      eventName: step.eventName,
      label: step.label,
      count,
      conversionFromStart: entered > 0 ? count / entered : 0,
      conversionFromPrevious: index === 0 || previous === 0 ? 1 : count / previous,
      droppedFromPrevious: index === 0 ? 0 : previous - count
    });
    previous = count;
  });

  const conversion = steps.length > 0 && entered > 0 ? steps[steps.length - 1].count / entered : 0;
  const conversionSeries = entrySeries.map(() => Math.max(0, conversion * 100 * (0.7 + rand() * 0.6)));

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    steps,
    conversion,
    medianSeconds: Math.round(40 + rand() * 60 * definition.steps.length * 4),
    entrySeries,
    conversionSeries
  };
}

// ── Requests ──

export interface DemoSpan {
  id: string;
  name: string;
  service: string;
  offsetMs: number;
  durationMs: number;
  status: 'ok' | 'error';
  depth: number;
}

export interface DemoRequest extends RequestListItem {
  host: string;
  url: string;
  userId: string | null;
  sessionId: string;
  instrumentation: string;
  requestSize: number | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  spans: DemoSpan[];
  logs: Array<{ offsetMs: number; level: 'info' | 'warn' | 'error'; message: string }>;
}

const ENVIRONMENTS = ['production', 'production', 'production', 'staging'];

function hex(rand: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function fillRoute(route: string, rand: () => number): string {
  return route
    .replace(':id', String(1000 + Math.floor(rand() * 9000)))
    .replace(':slug', ['spring-sale', 'getting-started', 'summer-edit', 'weekly-roundup'][Math.floor(rand() * 4)]);
}

function failureStatus(route: DemoRoute, rand: () => number): number {
  const roll = rand();
  if (roll < 0.35) return 500;
  if (roll < 0.5) return route.method === 'GET' ? 404 : 422;
  if (roll < 0.65) return 429;
  if (roll < 0.8) return 401;
  return roll < 0.9 ? 502 : 504;
}

/**
 * A page of sampled requests across the window, newest first. Each carries the
 * detail the drawer shows, so opening one needs no extra lookup.
 */
export function buildRequests(company: DemoCompany, range: DemoRange, now: Date, count = 240): DemoRequest[] {
  const profile = DEMO_CATEGORIES[company.category];
  const rand = seededRandom(seedFor(company, `requests:${range}`));
  const windowMs = rangeInfo(range).buckets * (rangeInfo(range).hourly ? 3_600_000 : 86_400_000);
  const host = `api.${companyDomain(company.name)}`;
  // Skewed towards recent traffic; sorted so the newest request comes first.
  const offsets = Array.from({ length: count }, () => Math.pow(rand(), 1.6) * windowMs).sort((a, b) => a - b);

  return offsets.map((offset, index) => {
    const route = pickWeighted(profile.routes, rand);
    const failed = rand() < route.failure * 3;
    const statusCode = failed ? failureStatus(route, rand) : route.method === 'POST' && rand() < 0.4 ? 201 : 200;
    const slow = rand() < 0.06;
    const durationMs = Math.max(1, Math.round(route.latency * (0.5 + rand() * 0.9) * (slow ? 4 + rand() * 6 : 1) * (statusCode >= 500 ? 2.2 : 1)));
    const occurredAt = new Date(now.getTime() - offset).toISOString();
    const concrete = fillRoute(route.route, rand);
    const timedBy: 'server' | 'client' = rand() < 0.18 ? 'client' : 'server';
    const captureRoll = rand();
    const captureState: CaptureState =
      route.route.includes('health') ? 'metadata_only'
        : captureRoll < 0.5 ? 'captured'
        : captureRoll < 0.72 ? 'redacted'
        : captureRoll < 0.95 ? 'metadata_only'
        : 'unavailable';
    const requestId = `req_${hex(rand, 12)}`;
    const traceId = hex(rand, 32);
    const userId = rand() < 0.7 ? `user_${hex(rand, 8)}` : null;
    const responseSize = statusCode === 204 ? 0 : Math.round(200 + rand() * (route.method === 'GET' ? 24_000 : 2_000));
    const requestSize = route.method === 'GET' || route.method === 'DELETE' ? null : Math.round(80 + rand() * 1_400);
    const spans = buildSpans(route, durationMs, statusCode, rand);
    return {
      id: `demo_${index}_${hex(rand, 6)}`,
      occurredAt,
      requestId,
      traceId,
      service: timedBy === 'client' ? null : route.service,
      environment: ENVIRONMENTS[Math.floor(rand() * ENVIRONMENTS.length)],
      method: route.method,
      route: route.route,
      statusCode,
      durationMs,
      responseSize,
      captureState,
      timedBy,
      host,
      url: `https://${host}${concrete}`,
      userId,
      sessionId: `ses_${hex(rand, 10)}`,
      instrumentation: timedBy === 'client' ? 'traceiq-sdk-js/fetch' : 'traceiq-node/express',
      requestSize,
      requestHeaders: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: '[REDACTED]',
        'user-agent': timedBy === 'client' ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' : 'node-fetch/3.3',
        'x-request-id': requestId
      },
      responseHeaders: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': route.method === 'GET' ? 'private, max-age=30' : 'no-store',
        'x-trace-id': traceId,
        ...(statusCode === 429 ? { 'retry-after': '30' } : {})
      },
      requestBody: requestSize ? requestBodyFor(route, rand) : null,
      responseBody: responseBodyFor(route, statusCode, concrete, rand),
      spans,
      logs: logsFor(route, statusCode, durationMs)
    } satisfies DemoRequest;
  });
}

function buildSpans(route: DemoRoute, durationMs: number, statusCode: number, rand: () => number): DemoSpan[] {
  const spans: DemoSpan[] = [
    { id: 'root', name: `${route.method} ${route.route}`, service: route.service, offsetMs: 0, durationMs, status: statusCode >= 500 ? 'error' : 'ok', depth: 0 }
  ];
  const auth = Math.max(1, Math.round(durationMs * 0.06));
  spans.push({ id: 'auth', name: 'auth.verify_session', service: 'auth', offsetMs: 1, durationMs: auth, status: statusCode === 401 ? 'error' : 'ok', depth: 1 });
  if (statusCode === 401) return spans;
  const cacheStart = auth + 1;
  const cache = Math.max(1, Math.round(durationMs * 0.04));
  spans.push({ id: 'cache', name: 'redis.GET', service: 'cache', offsetMs: cacheStart, durationMs: cache, status: 'ok', depth: 1 });
  const dbStart = cacheStart + cache + 1;
  const db = Math.max(1, Math.round(durationMs * (0.35 + rand() * 0.25)));
  spans.push({ id: 'db', name: route.method === 'GET' ? 'postgres.SELECT' : 'postgres.INSERT', service: 'postgres', offsetMs: dbStart, durationMs: db, status: statusCode >= 500 && rand() < 0.5 ? 'error' : 'ok', depth: 1 });
  if (route.latency > 200) {
    const extStart = dbStart + db + 1;
    spans.push({
      id: 'external',
      name: route.service === 'payments' || route.service === 'billing' || route.service === 'checkout' ? 'stripe.paymentIntents.create' : 'http.outbound',
      service: 'external',
      offsetMs: extStart,
      durationMs: Math.max(1, durationMs - extStart - 2),
      status: statusCode >= 502 ? 'error' : 'ok',
      depth: 1
    });
  }
  return spans;
}

function requestBodyFor(route: DemoRoute, rand: () => number): unknown {
  if (route.route.includes('auth')) return { email: 'j***@example.com', password: '[REDACTED]' };
  if (route.route.includes('cart')) return { productId: `prod_${hex(rand, 6)}`, quantity: 1 + Math.floor(rand() * 3) };
  if (route.route.includes('transfer')) return { amount: Math.round(rand() * 50_000) / 100, currency: 'USD', to: 'acct_****4821' };
  if (route.route.includes('invite')) return { email: 'teammate@example.com', role: 'editor' };
  return { source: 'web', clientVersion: '2.14.0' };
}

function responseBodyFor(route: DemoRoute, statusCode: number, concrete: string, rand: () => number): unknown {
  if (statusCode >= 400) {
    const messages: Record<number, string> = {
      401: 'Session expired',
      404: 'Not found',
      422: 'Validation failed',
      429: 'Too many requests',
      500: 'Internal server error',
      502: 'Upstream provider unavailable',
      504: 'Upstream timed out'
    };
    return { error: { status: statusCode, message: messages[statusCode] ?? 'Request failed', path: concrete } };
  }
  if (route.route.endsWith('health')) return { ok: true, uptime: Math.round(rand() * 900_000) };
  if (route.method === 'GET' && /s$|search|feed|transactions|logs/.test(route.route)) {
    return {
      data: Array.from({ length: 3 }, (_, i) => ({ id: `${route.service}_${hex(rand, 6)}`, position: i + 1 })),
      nextCursor: hex(rand, 10),
      total: 20 + Math.floor(rand() * 400)
    };
  }
  return { id: `${route.service}_${hex(rand, 8)}`, status: statusCode === 201 ? 'created' : 'ok' };
}

function logsFor(route: DemoRoute, statusCode: number, durationMs: number): DemoRequest['logs'] {
  const logs: DemoRequest['logs'] = [{ offsetMs: 0, level: 'info', message: `${route.method} ${route.route} received` }];
  if (durationMs > route.latency * 3) logs.push({ offsetMs: Math.round(durationMs * 0.6), level: 'warn', message: `Slow query on ${route.service} (${Math.round(durationMs * 0.5)} ms)` });
  if (statusCode >= 500) logs.push({ offsetMs: Math.round(durationMs * 0.9), level: 'error', message: statusCode === 500 ? 'Unhandled exception: TypeError: Cannot read properties of undefined' : `Upstream returned ${statusCode}` });
  else if (statusCode === 429) logs.push({ offsetMs: 1, level: 'warn', message: 'Rate limit exceeded for API key' });
  logs.push({ offsetMs: durationMs, level: statusCode >= 500 ? 'error' : 'info', message: `Responded ${statusCode} in ${durationMs} ms` });
  return logs;
}

export function summarizeRequests(requests: DemoRequest[]): RequestsSummary {
  const total = requests.length;
  const serverErrors = requests.filter((request) => request.statusCode >= 500).length;
  const failed = requests.filter((request) => request.statusCode >= 400).length;
  const durations = requests.map((request) => request.durationMs).sort((a, b) => a - b);
  const p95 = durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;
  return {
    total,
    serverErrors,
    errorRate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
    p95,
    captures: {
      captured: requests.filter((request) => request.captureState === 'captured').length,
      redacted: requests.filter((request) => request.captureState === 'redacted').length,
      metadataOnly: requests.filter((request) => request.captureState === 'metadata_only').length,
      unavailable: requests.filter((request) => request.captureState === 'unavailable').length
    }
  };
}

export interface DemoRequestFilters {
  search: string;
  method: string;
  status: string;
  service: string;
  sort: 'time' | 'duration';
}

export const DEFAULT_DEMO_REQUEST_FILTERS: DemoRequestFilters = { search: '', method: '', status: '', service: '', sort: 'time' };

export function filterRequests(requests: DemoRequest[], filters: DemoRequestFilters): DemoRequest[] {
  const search = filters.search.trim().toLowerCase();
  const matched = requests.filter((request) => {
    if (filters.method && request.method !== filters.method) return false;
    if (filters.service && (request.service ?? 'browser') !== filters.service) return false;
    if (filters.status) {
      const code = request.statusCode;
      if (filters.status === '2xx' && !(code >= 200 && code < 300)) return false;
      if (filters.status === '4xx' && !(code >= 400 && code < 500)) return false;
      if (filters.status === '5xx' && code < 500) return false;
      if (filters.status === 'slow' && request.durationMs < 1000) return false;
    }
    if (search) {
      const haystack = [request.route, request.url, request.service ?? '', request.requestId ?? '', request.traceId ?? ''].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  return filters.sort === 'duration' ? [...matched].sort((a, b) => b.durationMs - a.durationMs) : matched;
}

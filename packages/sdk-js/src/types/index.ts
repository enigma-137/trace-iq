export interface TraceIQInitOptions {
  projectId: string;
  writeKey: string;
  endpoint?: string;
  environment?: 'development' | 'staging' | 'production' | string;
  autoTrackPageViews?: boolean;
  autoCaptureExceptions?: boolean;
  autoCaptureRageClicks?: boolean;
  /** Collect CLS, INP, LCP, FCP, and TTFB as `$web_vital` events. Defaults to true. */
  autoCaptureWebVitals?: boolean;
  /** Automatically record an exposure event when a feature flag is read. Defaults to true. */
  autoTrackFlagExposures?: boolean;
  /**
   * Auto-capture outgoing fetch() calls as `$api_request` events (method, path,
   * status, durationMs) to power the API performance view. Off by default —
   * enabling it records every non-TraceIQ request the page makes.
   */
  autoCaptureRequests?: boolean;
  /** @deprecated Use replay.enabled. */
  enableReplay?: boolean;
  replay?: TraceIQReplayOptions;
  debug?: boolean;
}

export type TraceIQReplayPrivacyMode = 'strict' | 'balanced' | 'custom';

export interface TraceIQReplayOptions {
  /** Replay stays off unless explicitly enabled here and in project settings. */
  enabled?: boolean;
  /** Require grantReplayConsent() before rrweb is imported or started. */
  requireConsent?: boolean;
  /** Optional client-side ceiling; the server project/entitlement rate remains authoritative. */
  sampleRate?: number;
  /** Additional selectors. TraceIQ's built-in credential/payment blocks cannot be removed. */
  maskSelectors?: string[];
  blockSelectors?: string[];
  ignoreSelectors?: string[];
}

export interface TraceIQIdentity {
  userId: string;
  traits?: Record<string, unknown>;
}

export interface TraceIQGroup {
  organizationId: string;
  traits?: Record<string, unknown>;
}

export interface TraceIQFeatureFlags {
  flags: Record<string, boolean>;
  payloads: Record<string, unknown>;
  details?: Record<string, { enabled: boolean; reason: string; revision: number }>;
}

export interface FlagEvaluationDetail<T = unknown> {
  enabled: boolean;
  payload?: T;
  reason?: string;
  revision?: number;
}

export interface TraceIQFlagsApi {
  load(properties?: Record<string, string | number | boolean>): Promise<TraceIQFeatureFlags>;
  isEnabled(key: string, defaultValue?: boolean): boolean;
  getPayload<T = unknown>(key: string, defaultValue?: T): T | undefined;
  evaluate<T = unknown>(
    key: string,
    options?: { defaultValue?: boolean; defaultPayload?: T; trackExposure?: boolean }
  ): FlagEvaluationDetail<T>;
  recordExposure(key: string): void;
}

export interface TraceIQClient {
  initialize(options: TraceIQInitOptions): void;
  identify(identity: TraceIQIdentity): void;
  track(eventName: string, properties?: Record<string, unknown>): void;
  page(name?: string, properties?: Record<string, unknown>): void;
  group(group: TraceIQGroup): void;
  captureException(error: unknown, properties?: Record<string, unknown>): void;
  /**
   * Fetches this user's flag evaluations from the server and caches them.
   * `properties` (the user's plan, country, plan tier, etc.) is merged over the
   * identity/group traits and used to evaluate flag targeting rules.
   */
  loadFeatureFlags(properties?: Record<string, string | number | boolean>): Promise<TraceIQFeatureFlags>;
  /** True only when the flag was loaded and is on for this user. */
  isFeatureEnabled(key: string, defaultValue?: boolean): boolean;
  /** Remote-config payload for a flag, or defaultValue/undefined when off / not loaded / no payload. */
  getFeatureFlagPayload<T = unknown>(key: string, defaultValue?: T): T | undefined;
  /** Evaluates a feature flag and returns enabled status + payload. */
  evaluateFeatureFlag<T = unknown>(
    key: string,
    options?: { defaultValue?: boolean; defaultPayload?: T; trackExposure?: boolean }
  ): FlagEvaluationDetail<T>;
  /** Explicitly records exposure for a feature flag. Deduplicated per session. */
  recordFlagExposure(key: string): void;
  /** Feature flags API namespace. */
  flags: TraceIQFlagsApi;
  grantReplayConsent(): void;
  revokeReplayConsent(): void;
  startReplay(): Promise<boolean>;
  stopReplay(): void;
}

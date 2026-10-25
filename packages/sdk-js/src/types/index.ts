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
   * Auto-capture outgoing fetch() and XMLHttpRequest (axios, jQuery, …) calls as
   * `$api_request` events (method, path, status, durationMs). Off by default —
   * enabling it records every non-TraceIQ API call the page makes. Browser timings
   * are full round trips, so API performance reports them apart from server timings.
   *
   * Page loads are skipped: Next.js navigations/prefetches (RSC), dev-server and
   * HMR traffic, static assets, and any response that is an HTML document. Pass an
   * object to narrow or widen that, e.g. `{ include: ['https://api.example.com'] }`.
   */
  autoCaptureRequests?:
    | boolean
    | {
        /** Only record URLs containing one of these strings / matching these patterns. */
        include?: Array<string | RegExp>;
        /** Never record URLs containing one of these strings / matching these patterns. */
        exclude?: Array<string | RegExp>;
        /** Also record page loads, framework navigation and assets. Default false. */
        includePageRequests?: boolean;
      };
  /**
   * Send a W3C `traceparent` header on captured API calls so a `traceiq-node`
   * backend records its side of the request in the same trace, nested under the
   * browser request in the Requests waterfall. Only applies when
   * `autoCaptureRequests` is on.
   *
   * By default the header goes to same-origin requests only: on a cross-origin
   * request it triggers a CORS preflight, and the request fails unless that
   * server allows the `traceparent` header. List other origins your API allows it
   * on (strings match by substring, e.g. `['https://api.example.com']`), or pass
   * `false` to never send it.
   */
  propagateTraceHeaders?: boolean | Array<string | RegExp>;
  /**
   * Forward console output to TraceIQ Logs (service "web-console"). `true` captures
   * log/info/warn/error; pass `{ levels }` to choose. Off by default.
   */
  autoCaptureConsole?: boolean | { levels?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> };
  /** @deprecated Use replay.enabled. */
  enableReplay?: boolean;
  replay?: TraceIQReplayOptions;
  /**
   * Retries per event or log batch after a network error, HTTP 429 or 5xx, with
   * exponential backoff (1s, 2s, 4s, …) or the server's Retry-After. Other 4xx
   * responses are never retried. While the browser is offline, delivery waits for
   * it to come back online instead of spending retries. Defaults to 3; 0 disables.
   */
  maxRetries?: number;
  /**
   * Save events whose delivery is delayed (offline, or a failed first attempt) to
   * `localStorage`, and resend them on the next page load if the page closes first.
   * Only delayed events are saved, never every event. Up to 100 events, kept for
   * 24 hours. Saved events include their properties, so set `false` if those may
   * hold data you don't want at rest in the browser. Defaults to true.
   */
  persistUndeliveredEvents?: boolean;
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

export interface ExperimentVariantEvaluation<T = unknown> {
  experimentKey: string;
  variantKey: string;
  variantName: string;
  isControl: boolean;
  isEligible: boolean;
  payload?: T;
}

export interface TraceIQExperimentsApi {
  getVariant<T = unknown>(
    experimentKey: string,
    options?: { properties?: Record<string, unknown>; trackExposure?: boolean }
  ): Promise<ExperimentVariantEvaluation<T>>;
  recordExposure(experimentKey: string, variantKey: string): void;
}

export interface TraceIQSurveysApi {
  getEligibleSurveys(options?: {
    properties?: Record<string, unknown>;
    eventName?: string;
  }): Promise<Array<any>>;
  recordImpression(surveyId: string): void;
  recordDismissal(surveyId: string): void;
  submitResponse(surveyId: string, answers: Array<{ questionId: string; questionType: string; prompt: string; answerText?: string; selectedOptions?: string[]; rating?: number; score?: number }>): Promise<boolean>;
}

export type TraceIQLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface TraceIQClient {
  initialize(options: TraceIQInitOptions): void;
  identify(identity: TraceIQIdentity): void;
  track(eventName: string, properties?: Record<string, unknown>): void;
  page(name?: string, properties?: Record<string, unknown>): void;
  group(group: TraceIQGroup): void;
  captureException(error: unknown, properties?: Record<string, unknown>): void;
  /**
   * Sends a structured log line to TraceIQ Logs, tagged with this session and user.
   * Logs are buffered and sent in small batches. Pass `service` in attributes to
   * override the service name, and `error` (an Error) to attach its stack.
   *
   *   traceiq.log('error', 'Level 3 assets failed to load', { level: 3 });
   */
  log(level: TraceIQLogLevel, message: string, attributes?: Record<string, unknown>): void;
  /** Sends any buffered logs now (also happens automatically when the page is hidden). */
  flushLogs(): Promise<void>;
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
  /** Experiments API namespace. */
  experiments: TraceIQExperimentsApi;
  /** Surveys API namespace. */
  surveys: TraceIQSurveysApi;
  grantReplayConsent(): void;
  revokeReplayConsent(): void;
  startReplay(): Promise<boolean>;
  stopReplay(): void;
}


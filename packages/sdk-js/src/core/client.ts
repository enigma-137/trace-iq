import type { TraceIQClient, TraceIQFeatureFlags, TraceIQGroup, TraceIQIdentity, TraceIQInitOptions } from '../types';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';
import { ReplayRecorder } from './replay.js';

const DEFAULT_ENDPOINT = 'http://localhost:4000';
const ANONYMOUS_ID_STORAGE_KEY = 'traceiq.anonymousId';
const SESSION_ID_STORAGE_KEY = 'traceiq.sessionId';

export class BrowserTraceIQClient implements TraceIQClient {
  private options?: TraceIQInitOptions;
  private identity?: TraceIQIdentity;
  private groupContext?: TraceIQGroup;
  private anonymousId?: string;
  private sessionId?: string;
  private errorHandlersInstalled = false;
  private clickHandlersInstalled = false;
  private requestCaptureInstalled = false;
  private webVitalsInstalled = false;
  private recentClicks: Array<{ t: number; x: number; y: number }> = [];
  private lastRageAt = 0;
  private featureFlags: Record<string, boolean> = {};
  private featureFlagPayloads: Record<string, unknown> = {};
  private featureFlagDetails: Record<string, { enabled: boolean; reason: string; revision: number }> = {};
  private featureFlagsLoaded = false;
  private recordedExposures = new Set<string>();
  private replayConsentGranted = false;
  private replayRecorder?: ReplayRecorder;

  private pageTrackingInstalled = false;
  private lastPageUrl?: string;

  public readonly flags = {
    load: (properties?: Record<string, string | number | boolean>) => this.loadFeatureFlags(properties),
    isEnabled: (key: string, defaultValue = false) => this.isFeatureEnabled(key, defaultValue),
    getPayload: <T = unknown>(key: string, defaultValue?: T) => this.getFeatureFlagPayload<T>(key, defaultValue),
    evaluate: <T = unknown>(key: string, options?: { defaultValue?: boolean; defaultPayload?: T; trackExposure?: boolean }) =>
      this.evaluateFeatureFlag<T>(key, options),
    recordExposure: (key: string) => this.recordFlagExposure(key)
  };

  public readonly experiments = {
    getVariant: <T = unknown>(
      experimentKey: string,
      options?: { properties?: Record<string, unknown>; trackExposure?: boolean }
    ) => this.getExperimentVariant<T>(experimentKey, options),
    recordExposure: (experimentKey: string, variantKey: string) => this.recordExperimentExposure(experimentKey, variantKey)
  };

  public readonly surveys = {
    getEligibleSurveys: (options?: { properties?: Record<string, unknown>; eventName?: string }) =>
      this.getEligibleSurveys(options),
    recordImpression: (surveyId: string) => this.recordSurveyImpression(surveyId),
    recordDismissal: (surveyId: string) => this.recordSurveyDismissal(surveyId),
    submitResponse: (surveyId: string, answers: any[]) => this.submitSurveyResponse(surveyId, answers)
  };

  initialize(options: TraceIQInitOptions): void {
    if (!options?.projectId || !options?.writeKey) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[TraceIQ] Initialization failed: projectId and writeKey are required.');
      }
      return;
    }

    this.options = {
      ...options,
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT
    };
    this.anonymousId = this.loadOrCreateId('localStorage', ANONYMOUS_ID_STORAGE_KEY, 'anon');
    this.sessionId = this.loadOrCreateId('sessionStorage', SESSION_ID_STORAGE_KEY, 'sess');
    this.debug(`[TraceIQ] SDK initialized (endpoint: ${this.options.endpoint})`);

    if (options.replay?.enabled === true || options.enableReplay === true) {
      this.replayRecorder = new ReplayRecorder(
        this.options.endpoint ?? DEFAULT_ENDPOINT,
        { ...options.replay, enabled: true },
        () => this.options && this.sessionId ? {
          projectId: this.options.projectId, writeKey: this.options.writeKey, sessionId: this.sessionId,
          anonymousId: this.anonymousId, userId: this.identity?.userId
        } : undefined,
        () => this.replayConsentGranted,
        (message: string, error?: unknown) => this.debug(message, error)
      );
      void this.startReplay();
    }

    if (options.autoCaptureExceptions !== false) {
      this.installErrorHandlers();
    }

    if (options.autoCaptureRageClicks !== false) {
      this.installClickHandlers();
    }

    if (options.autoCaptureRequests) {
      this.installRequestCapture();
    }

    if (options.autoCaptureWebVitals !== false) {
      this.installWebVitals();
    }

    if (options.autoTrackPageViews !== false) {
      this.installPageTracking();
    }
  }

  private installPageTracking(): void {
    if (typeof window === 'undefined' || this.pageTrackingInstalled) {
      if (typeof window !== 'undefined') {
        this.page();
      }
      return;
    }
    this.pageTrackingInstalled = true;
    this.lastPageUrl = window.location.href;

    // Track initial page load
    this.debug('[TraceIQ] Emitting initial $page');
    this.page();

    // Listen to browser popstate (back/forward)
    window.addEventListener('popstate', () => {
      this.handleUrlChange();
    });

    // Monkey-patch history.pushState & history.replaceState for SPA / Next.js navigation
    const self = this;
    const originalPushState = history.pushState;
    if (typeof originalPushState === 'function') {
      history.pushState = function (...args: Parameters<typeof originalPushState>) {
        const result = originalPushState.apply(this, args);
        self.handleUrlChange();
        return result;
      };
    }

    const originalReplaceState = history.replaceState;
    if (typeof originalReplaceState === 'function') {
      history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
        const result = originalReplaceState.apply(this, args);
        self.handleUrlChange();
        return result;
      };
    }
  }

  private handleUrlChange(): void {
    if (typeof window === 'undefined') return;
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastPageUrl) {
      this.lastPageUrl = currentUrl;
      setTimeout(() => {
        this.page();
      }, 0);
    }
  }

  private installWebVitals(): void {
    if (typeof window === 'undefined' || this.webVitalsInstalled) return;
    this.webVitalsInstalled = true;
    const report = (metric: MetricType) => {
      this.track('$web_vital', {
        metric: metric.name,
        value: metric.value,
        delta: metric.delta,
        rating: metric.rating,
        metricId: metric.id,
        navigationType: metric.navigationType,
        navigationId: metric.navigationId
      });
    };
    onCLS(report);
    onINP(report);
    onLCP(report);
    onFCP(report);
    onTTFB(report);
  }

  captureException(error: unknown, properties: Record<string, unknown> = {}): void {
    const normalized = this.normalizeError(error);
    this.track('$exception', {
      type: normalized.type,
      message: normalized.message,
      stack: normalized.stack,
      handled: true,
      ...properties
    });
  }

  private installErrorHandlers(): void {
    if (typeof window === 'undefined' || this.errorHandlersInstalled) {
      return;
    }
    this.errorHandlersInstalled = true;

    window.addEventListener('error', (event: ErrorEvent) => {
      const normalized = this.normalizeError(event.error ?? event.message);
      this.track('$exception', {
        type: normalized.type,
        message: normalized.message,
        stack: normalized.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        handled: false
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const normalized = this.normalizeError(event.reason);
      this.track('$exception', {
        type: normalized.type || 'UnhandledRejection',
        message: normalized.message,
        stack: normalized.stack,
        handled: false
      });
    });
  }

  private installClickHandlers(): void {
    if (typeof window === 'undefined' || this.clickHandlersInstalled) {
      return;
    }
    this.clickHandlersInstalled = true;

    window.addEventListener(
      'click',
      (event: MouseEvent) => {
        const now = Date.now();
        // Keep only clicks within the last second.
        this.recentClicks = this.recentClicks.filter((c) => now - c.t < 1000);
        this.recentClicks.push({ t: now, x: event.clientX, y: event.clientY });

        // Rage click: 3+ clicks in ~1s within a small radius, throttled to once/sec.
        if (this.recentClicks.length >= 3 && now - this.lastRageAt > 1000) {
          const clustered = this.recentClicks.every(
            (c) => Math.abs(c.x - event.clientX) < 30 && Math.abs(c.y - event.clientY) < 30
          );
          if (clustered) {
            this.lastRageAt = now;
            this.recentClicks = [];
            const target = event.target as Element | null;
            this.track('$rageclick', {
              x: event.clientX,
              y: event.clientY,
              element: target?.tagName ? target.tagName.toLowerCase() : undefined
            });
          }
        }
      },
      true
    );
  }

  // Wrap window.fetch to time each request and emit a `$api_request` event. Our own
  // ingestion/flag calls are skipped so we never capture (or loop on) ourselves.
  private installRequestCapture(): void {
    if (typeof window === 'undefined' || this.requestCaptureInstalled) {
      return;
    }
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') {
      return;
    }
    this.requestCaptureInstalled = true;
    const self = this;

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = self.requestUrl(input);
      const method = self.requestMethod(input, init);

      if (self.isInternalUrl(url)) {
        return originalFetch.call(window, input as RequestInfo, init);
      }

      const start = self.nowMs();
      return originalFetch.call(window, input as RequestInfo, init).then(
        (response: Response) => {
          self.recordRequest(method, url, response.status, self.nowMs() - start, response);
          return response;
        },
        (error: unknown) => {
          // Network error / abort — record as status 0 so it still shows as a failure.
          self.recordRequest(method, url, 0, self.nowMs() - start);
          throw error;
        }
      );
    };
  }

  private recordRequest(method: string, url: string, status: number, durationMs: number, response?: Response): void {
    const properties: Record<string, unknown> = {
      method,
      path: normalizeApiPath(url, this.getLocation()?.origin),
      status,
      durationMs: Math.round(durationMs),
      ok: status >= 200 && status < 400
    };
    // When an instrumented backend echoes its request id (and CORS exposes it), the
    // browser-side record links to the server-side record of the same request.
    const requestId = this.responseHeader(response, 'x-request-id');
    if (requestId && /^[A-Za-z0-9._:/+=-]{1,128}$/.test(requestId)) properties.requestId = requestId;
    const size = Number(this.responseHeader(response, 'content-length'));
    if (Number.isFinite(size) && size >= 0 && this.responseHeader(response, 'content-length') !== null) {
      properties.responseSize = size;
    }
    this.track('$api_request', properties);
  }

  private responseHeader(response: Response | undefined, name: string): string | null {
    try {
      return response?.headers?.get(name) ?? null;
    } catch {
      return null;
    }
  }

  private requestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  private requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    const fromInit = init?.method;
    const fromRequest = typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined;
    return (fromInit ?? fromRequest ?? 'GET').toUpperCase();
  }

  private isInternalUrl(url: string): boolean {
    const endpoint = this.options?.endpoint ?? DEFAULT_ENDPOINT;
    return url.startsWith(endpoint);
  }

  private nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  private normalizeError(error: unknown): { type: string; message: string; stack?: string } {
    if (error instanceof Error) {
      return { type: error.name || 'Error', message: error.message, stack: error.stack };
    }
    if (typeof error === 'string') {
      return { type: 'Error', message: error };
    }
    try {
      return { type: 'Error', message: JSON.stringify(error) };
    } catch {
      return { type: 'Error', message: 'Unknown error' };
    }
  }

  identify(identity: TraceIQIdentity): void {
    this.identity = identity;
    this.track('$identify', {
      traits: identity.traits ?? {}
    });
  }

  track(eventName: string, properties: Record<string, unknown> = {}): void {
    if (!this.options) {
      this.debug('TraceIQ has not been initialized.');
      return;
    }

    void this.sendEvent(eventName, properties);
  }

  page(name?: string, properties: Record<string, unknown> = {}): void {
    this.track('$page', {
      name: name ?? this.getPageTitle(),
      ...properties
    });
  }

  group(group: TraceIQGroup): void {
    this.groupContext = group;
    this.track('$group', {
      organizationId: group.organizationId,
      traits: group.traits ?? {}
    });
  }

  async loadFeatureFlags(properties?: Record<string, string | number | boolean>): Promise<TraceIQFeatureFlags> {
    const options = this.options;
    if (!options) {
      this.debug('TraceIQ has not been initialized.');
      return { flags: {}, payloads: {} };
    }

    // Unify the traits the host app has told us about with any explicit overrides,
    // so a targeted flag (e.g. plan = pro) evaluates against the right values.
    const traits = {
      ...(this.identity?.traits ?? {}),
      ...(this.groupContext?.traits ?? {}),
      ...(properties ?? {})
    };

    const endpoint = this.flagsEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': options.writeKey
        },
        body: JSON.stringify({
          projectId: options.projectId,
          distinctId: this.distinctId(),
          environment: options.environment,
          properties: Object.keys(traits).length > 0 ? traits : undefined
        })
      });

      if (!response.ok) {
        this.debug(`TraceIQ flag evaluation rejected with ${response.status}.`);
        return { flags: this.featureFlags, payloads: this.featureFlagPayloads, details: this.featureFlagDetails };
      }

      const body = (await response.json()) as Partial<TraceIQFeatureFlags>;
      this.featureFlags = body.flags ?? {};
      this.featureFlagPayloads = body.payloads ?? {};
      this.featureFlagDetails = body.details ?? {};
      this.featureFlagsLoaded = true;
    } catch (error) {
      this.debug('TraceIQ flag evaluation failed.', error);
    }

    return { flags: this.featureFlags, payloads: this.featureFlagPayloads, details: this.featureFlagDetails };
  }

  isFeatureEnabled(key: string, defaultValue = false): boolean {
    if (!this.featureFlagsLoaded) {
      this.debug('Feature flags have not been loaded yet — call loadFeatureFlags() first.');
      return defaultValue;
    }
    const enabled = this.featureFlags[key] ?? defaultValue;
    if (this.options?.autoTrackFlagExposures !== false) {
      this.recordFlagExposure(key);
    }
    return enabled;
  }

  getFeatureFlagPayload<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (this.featureFlags[key] !== true) {
      return defaultValue;
    }
    if (this.options?.autoTrackFlagExposures !== false) {
      this.recordFlagExposure(key);
    }
    return (this.featureFlagPayloads[key] as T) ?? defaultValue;
  }

  evaluateFeatureFlag<T = unknown>(
    key: string,
    options?: { defaultValue?: boolean; defaultPayload?: T; trackExposure?: boolean }
  ): { enabled: boolean; payload?: T; reason?: string; revision?: number } {
    const isLoaded = this.featureFlagsLoaded;
    const isEnabled = isLoaded ? (this.featureFlags[key] ?? options?.defaultValue ?? false) : (options?.defaultValue ?? false);
    const payload = isEnabled ? ((this.featureFlagPayloads[key] as T) ?? options?.defaultPayload) : options?.defaultPayload;
    const detail = this.featureFlagDetails[key];

    if (options?.trackExposure !== false && this.options?.autoTrackFlagExposures !== false) {
      this.recordFlagExposure(key);
    }

    return {
      enabled: isEnabled,
      payload,
      reason: detail?.reason,
      revision: detail?.revision
    };
  }

  recordFlagExposure(key: string): void {
    const options = this.options;
    if (!options) return;

    const isEnabled = this.featureFlags[key] === true;
    const detail = this.featureFlagDetails[key];
    const revision = detail?.revision ?? 1;
    const dedupKey = `${key}:${this.distinctId()}:${revision}:${isEnabled ? '1' : '0'}`;
    if (this.recordedExposures.has(dedupKey)) {
      return;
    }
    this.recordedExposures.add(dedupKey);

    const endpoint = `${(options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/flags/exposure`;

    void fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-traceiq-write-key': options.writeKey,
        ...(options.environment ? { 'x-traceiq-environment': options.environment } : {})
      },
      body: JSON.stringify({
        projectId: options.projectId,
        flagKey: key,
        distinctId: this.distinctId(),
        userId: this.identity?.userId,
        anonymousId: this.anonymousId,
        sessionId: this.sessionId,
        enabled: isEnabled,
        environment: options.environment ?? 'production',
        revision: detail?.revision ?? 1,
        evaluationReason: detail?.reason ?? (isEnabled ? 'sdk_enabled' : 'sdk_disabled')
      })
    }).catch((err) => {
      this.debug('TraceIQ flag exposure tracking error', err);
    });
  }

  async getExperimentVariant<T = unknown>(
    experimentKey: string,
    options?: { properties?: Record<string, unknown>; trackExposure?: boolean }
  ): Promise<{
    experimentKey: string;
    variantKey: string;
    variantName: string;
    isControl: boolean;
    isEligible: boolean;
    payload?: T;
  }> {
    const defaultResult = {
      experimentKey,
      variantKey: 'control',
      variantName: 'Control',
      isControl: true,
      isEligible: false,
      payload: undefined
    };

    const clientOpts = this.options;
    if (!clientOpts) {
      this.debug('[TraceIQ] getExperimentVariant: SDK not initialized.');
      return defaultResult;
    }

    try {
      const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/experiments/evaluate`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': clientOpts.writeKey,
          ...(clientOpts.environment ? { 'x-traceiq-environment': clientOpts.environment } : {})
        },
        body: JSON.stringify({
          projectId: clientOpts.projectId,
          experimentKey,
          distinctId: this.distinctId(),
          environment: clientOpts.environment ?? 'production',
          properties: options?.properties ?? this.identity?.traits
        })
      });

      if (!response.ok) {
        this.debug(`[TraceIQ] Experiment evaluation returned HTTP ${response.status}`);
        return defaultResult;
      }

      const result = await response.json();
      if (options?.trackExposure !== false && result.isEligible && result.variantKey) {
        this.recordExperimentExposure(experimentKey, result.variantKey);
      }

      return {
        experimentKey,
        variantKey: result.variantKey ?? 'control',
        variantName: result.variantName ?? 'Control',
        isControl: Boolean(result.isControl),
        isEligible: Boolean(result.isEligible),
        payload: result.payload as T | undefined
      };
    } catch (err) {
      this.debug('[TraceIQ] Experiment evaluation failed:', err);
      return defaultResult;
    }
  }

  recordExperimentExposure(experimentKey: string, variantKey: string): void {
    const clientOpts = this.options;
    if (!clientOpts) return;

    const dedupKey = `exp:${experimentKey}:${this.distinctId()}:${variantKey}`;
    if (this.recordedExposures.has(dedupKey)) {
      return;
    }
    this.recordedExposures.add(dedupKey);

    const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/experiments/exposure`;
    void fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-traceiq-write-key': clientOpts.writeKey,
        ...(clientOpts.environment ? { 'x-traceiq-environment': clientOpts.environment } : {})
      },
      body: JSON.stringify({
        projectId: clientOpts.projectId,
        experimentKey,
        variantKey,
        distinctId: this.distinctId(),
        userId: this.identity?.userId,
        anonymousId: this.anonymousId,
        sessionId: this.sessionId,
        environment: clientOpts.environment ?? 'production'
      })
    }).catch((err) => {
      this.debug('[TraceIQ] Experiment exposure tracking failed:', err);
    });
  }

  async getEligibleSurveys(options?: {
    properties?: Record<string, unknown>;
    eventName?: string;
  }): Promise<Array<any>> {
    const clientOpts = this.options;
    if (!clientOpts) return [];

    try {
      const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/surveys/eligible`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': clientOpts.writeKey,
          ...(clientOpts.environment ? { 'x-traceiq-environment': clientOpts.environment } : {})
        },
        body: JSON.stringify({
          projectId: clientOpts.projectId,
          distinctId: this.distinctId(),
          properties: options?.properties ?? this.identity?.traits,
          eventName: options?.eventName,
          environment: clientOpts.environment ?? 'production'
        })
      });

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.surveys) ? data.surveys : [];
    } catch (err) {
      this.debug('[TraceIQ] Failed to load eligible surveys:', err);
      return [];
    }
  }

  recordSurveyImpression(surveyId: string): void {
    const clientOpts = this.options;
    if (!clientOpts) return;

    const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/surveys/impression`;
    void fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-traceiq-write-key': clientOpts.writeKey
      },
      body: JSON.stringify({
        projectId: clientOpts.projectId,
        surveyId,
        distinctId: this.distinctId(),
        userId: this.identity?.userId,
        anonymousId: this.anonymousId,
        sessionId: this.sessionId
      })
    }).catch((err) => {
      this.debug('[TraceIQ] Survey impression tracking failed:', err);
    });
  }

  recordSurveyDismissal(surveyId: string): void {
    const clientOpts = this.options;
    if (!clientOpts) return;

    const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/surveys/dismiss`;
    void fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-traceiq-write-key': clientOpts.writeKey
      },
      body: JSON.stringify({
        projectId: clientOpts.projectId,
        surveyId,
        distinctId: this.distinctId(),
        userId: this.identity?.userId,
        anonymousId: this.anonymousId,
        sessionId: this.sessionId
      })
    }).catch((err) => {
      this.debug('[TraceIQ] Survey dismissal tracking failed:', err);
    });
  }

  async submitSurveyResponse(
    surveyId: string,
    answers: Array<{
      questionId: string;
      questionType: string;
      prompt: string;
      answerText?: string;
      selectedOptions?: string[];
      rating?: number;
      score?: number;
    }>
  ): Promise<boolean> {
    const clientOpts = this.options;
    if (!clientOpts) return false;

    try {
      const endpoint = `${(clientOpts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')}/v1/surveys/response`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': clientOpts.writeKey
        },
        body: JSON.stringify({
          projectId: clientOpts.projectId,
          surveyId,
          distinctId: this.distinctId(),
          userId: this.identity?.userId,
          anonymousId: this.anonymousId,
          sessionId: this.sessionId,
          answers
        })
      });

      return response.ok;
    } catch (err) {
      this.debug('[TraceIQ] Survey response submission failed:', err);
      return false;
    }
  }

  private distinctId(): string | undefined {
    return this.identity?.userId ?? this.anonymousId;
  }

  private flagsEndpoint(endpoint: string): string {
    return `${endpoint.replace(/\/$/, '')}/v1/flags/evaluate`;
  }

  get initialized(): boolean {
    return Boolean(this.options);
  }

  grantReplayConsent(): void {
    this.replayConsentGranted = true;
    void this.replayRecorder?.grantConsent();
  }

  revokeReplayConsent(): void {
    this.replayConsentGranted = false;
    // Already-uploaded chunks follow project retention or can be deleted through
    // TraceIQ's replay/data-subject deletion APIs. Unsent data is discarded.
    this.replayRecorder?.revokeConsent();
  }

  startReplay(): Promise<boolean> {
    return this.replayRecorder?.start() ?? Promise.resolve(false);
  }

  stopReplay(): void {
    this.replayRecorder?.stop();
  }

  private async sendEvent(eventName: string, properties: Record<string, unknown>): Promise<void> {
    const options = this.options;
    if (!options) {
      return;
    }

    const endpoint = this.eventEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
    const payload = {
      projectId: options.projectId,
      userId: this.identity?.userId,
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      eventName,
      properties,
      deviceInfo: this.buildDeviceInfo(),
      networkInfo: this.buildNetworkInfo(),
      context: this.buildContext(),
      timestamp: new Date().toISOString()
    };

    this.debug(`[TraceIQ] Sending event ${eventName} to ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': options.writeKey
        },
        body: JSON.stringify(payload),
        keepalive: true
      });

      if (!response.ok) {
        this.debug(`[TraceIQ] Event rejected: HTTP ${response.status}`);
      } else {
        this.debug(`[TraceIQ] Event accepted: ${response.status}`);
        // Replay flow eligibility is evaluated only after TraceIQ accepted the
        // event, allowing the API to prove the session entered a selected
        // funnel instead of trusting an SDK-supplied funnel identifier.
        this.replayRecorder?.eventAccepted(eventName);
      }
    } catch (error) {
      this.debug('[TraceIQ] Event delivery failed:', error);
    }
  }

  private buildContext(): Record<string, unknown> {
    const location = this.getLocation();
    const navigator = this.getNavigator();
    const screen = this.getScreen();
    const searchParams = new URLSearchParams(location?.search ?? '');
    const utm = {
      source: searchParams.get('utm_source') ?? undefined,
      medium: searchParams.get('utm_medium') ?? undefined,
      campaign: searchParams.get('utm_campaign') ?? undefined,
      term: searchParams.get('utm_term') ?? undefined,
      content: searchParams.get('utm_content') ?? undefined
    };

    return {
      page: {
        url: location?.href,
        path: location?.pathname,
        search: location?.search,
        utm,
        referrer: this.getReferrer(),
        title: this.getPageTitle()
      },
      device: {
        userAgent: navigator?.userAgent,
        language: navigator?.language,
        viewport: screen
      },
      group: this.groupContext
        ? {
            organizationId: this.groupContext.organizationId,
            traits: this.groupContext.traits ?? {}
          }
        : undefined,
      sdk: {
        name: 'traceiq-sdk-js',
        version: '0.1.0'
      },
      timezone: this.getTimezone()
    };
  }

  private buildDeviceInfo(): Record<string, unknown> {
    const navigator = this.getNavigator();
    const userAgent = navigator?.userAgent ?? '';
    const os = this.detectOs(userAgent);
    const deviceType = this.detectDeviceType(userAgent);
    const browser = this.detectBrowser(userAgent);

    return {
      platform: 'web',
      os: os.name,
      osVersion: os.version,
      deviceType,
      browser: browser.name,
      browserVersion: browser.version,
      userAgent,
      viewport: this.getScreen(),
      locale: navigator?.language
    };
  }

  private buildNetworkInfo(): Record<string, unknown> {
    const connection = this.getConnection();
    return {
      // ipAddress + geo (country/region/city) are resolved server-side from the request.
      connectionType: connection?.type,
      effectiveType: connection?.effectiveType
    };
  }

  private detectOs(ua: string): { name?: string; version?: string } {
    if (/iPhone|iPad|iPod/i.test(ua)) {
      const match = ua.match(/OS (\d+[_.]\d+)/);
      return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') };
    }
    if (/Android/i.test(ua)) {
      const match = ua.match(/Android (\d+(?:\.\d+)?)/);
      return { name: 'Android', version: match?.[1] };
    }
    if (/Windows NT/i.test(ua)) {
      const match = ua.match(/Windows NT (\d+\.\d+)/);
      return { name: 'Windows', version: match?.[1] };
    }
    if (/Mac OS X/i.test(ua)) {
      const match = ua.match(/Mac OS X (\d+[_.]\d+)/);
      return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') };
    }
    if (/Linux/i.test(ua)) {
      return { name: 'Linux' };
    }
    return {};
  }

  private detectDeviceType(ua: string): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
    if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobi|iPhone|iPod|Android/i.test(ua)) {
      return 'mobile';
    }
    if (ua) {
      return 'desktop';
    }
    return 'unknown';
  }

  private detectBrowser(ua: string): { name?: string; version?: string } {
    const patterns: Array<{ name: string; re: RegExp }> = [
      { name: 'Edge', re: /Edg\/(\d+[.\d]*)/ },
      { name: 'Opera', re: /OPR\/(\d+[.\d]*)/ },
      { name: 'Chrome', re: /Chrome\/(\d+[.\d]*)/ },
      { name: 'Firefox', re: /Firefox\/(\d+[.\d]*)/ },
      { name: 'Safari', re: /Version\/(\d+[.\d]*).*Safari/ }
    ];
    for (const { name, re } of patterns) {
      const match = ua.match(re);
      if (match) {
        return { name, version: match[1] };
      }
    }
    return {};
  }

  private getConnection(): { type?: string; effectiveType?: string } | undefined {
    try {
      const nav = this.getNavigator() as (Navigator & { connection?: { type?: string; effectiveType?: string } }) | undefined;
      return nav?.connection;
    } catch {
      return undefined;
    }
  }

  private loadOrCreateId(storageType: 'localStorage' | 'sessionStorage', key: string, prefix: string): string {
    const storage = this.getStorage(storageType);
    const existing = storage?.getItem(key);
    if (existing) {
      return existing;
    }

    const nextId = `${prefix}_${this.generateId()}`;
    storage?.setItem(key, nextId);
    return nextId;
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  private eventEndpoint(endpoint: string): string {
    return `${endpoint.replace(/\/$/, '')}/v1/events`;
  }

  private getStorage(storageType: 'localStorage' | 'sessionStorage'): Storage | undefined {
    try {
      if (typeof window === 'undefined') {
        return undefined;
      }

      return window[storageType];
    } catch {
      return undefined;
    }
  }

  private getLocation(): Location | undefined {
    return typeof window !== 'undefined' ? window.location : undefined;
  }

  private getNavigator(): Navigator | undefined {
    return typeof navigator !== 'undefined' ? navigator : undefined;
  }

  private getScreen(): { width: number; height: number } | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  private getPageTitle(): string | undefined {
    return typeof document !== 'undefined' ? document.title : undefined;
  }

  private getReferrer(): string | undefined {
    return typeof document !== 'undefined' ? document.referrer : undefined;
  }

  private getTimezone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }

  private debug(message: string, error?: unknown): void {
    const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';
    if (this.options?.debug || isDev) {
      if (error !== undefined) {
        console.warn(message, error);
      } else {
        console.log(message);
      }
    }
  }
}

// Turns a request URL into a groupable route: strips origin + query, then collapses
// id-like segments so /users/123 and /users/abc-uuid both become /users/:id.
export function normalizeApiPath(rawUrl: string, base?: string): string {
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, base ?? 'http://localhost').pathname;
  } catch {
    pathname = rawUrl.split('?')[0];
  }
  const collapsed = pathname
    .split('/')
    .map((segment) => (isIdSegment(segment) ? ':id' : segment))
    .join('/');
  return collapsed || '/';
}

function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  if (/^\d+$/.test(segment)) return true; // 123
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true; // uuid
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true; // long hex id
  if (/^\d/.test(segment) && /[a-z]/i.test(segment) && segment.length >= 12) return true; // mixed id like usr_...
  return false;
}

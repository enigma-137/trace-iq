import type { TraceIQClient, TraceIQFeatureFlags, TraceIQGroup, TraceIQIdentity, TraceIQInitOptions } from '../types';

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
  private recentClicks: Array<{ t: number; x: number; y: number }> = [];
  private lastRageAt = 0;
  private featureFlags: Record<string, boolean> = {};
  private featureFlagPayloads: Record<string, unknown> = {};
  private featureFlagsLoaded = false;

  initialize(options: TraceIQInitOptions): void {
    this.options = {
      ...options,
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT
    };
    this.anonymousId = this.loadOrCreateId('localStorage', ANONYMOUS_ID_STORAGE_KEY, 'anon');
    this.sessionId = this.loadOrCreateId('sessionStorage', SESSION_ID_STORAGE_KEY, 'sess');

    if (options.autoCaptureExceptions !== false) {
      this.installErrorHandlers();
    }

    if (options.autoCaptureRageClicks !== false) {
      this.installClickHandlers();
    }

    if (options.autoCaptureRequests) {
      this.installRequestCapture();
    }

    if (options.autoTrackPageViews) {
      this.page();
    }
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
          self.recordRequest(method, url, response.status, self.nowMs() - start);
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

  private recordRequest(method: string, url: string, status: number, durationMs: number): void {
    this.track('$api_request', {
      method,
      path: normalizeApiPath(url, this.getLocation()?.origin),
      url,
      status,
      durationMs: Math.round(durationMs),
      ok: status >= 200 && status < 400
    });
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

  async loadFeatureFlags(): Promise<TraceIQFeatureFlags> {
    const options = this.options;
    if (!options) {
      this.debug('TraceIQ has not been initialized.');
      return { flags: {}, payloads: {} };
    }

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
          distinctId: this.distinctId()
        })
      });

      if (!response.ok) {
        this.debug(`TraceIQ flag evaluation rejected with ${response.status}.`);
        return { flags: this.featureFlags, payloads: this.featureFlagPayloads };
      }

      const body = (await response.json()) as Partial<TraceIQFeatureFlags>;
      this.featureFlags = body.flags ?? {};
      this.featureFlagPayloads = body.payloads ?? {};
      this.featureFlagsLoaded = true;
    } catch (error) {
      this.debug('TraceIQ flag evaluation failed.', error);
    }

    return { flags: this.featureFlags, payloads: this.featureFlagPayloads };
  }

  isFeatureEnabled(key: string): boolean {
    if (!this.featureFlagsLoaded) {
      this.debug('Feature flags have not been loaded yet — call loadFeatureFlags() first.');
    }
    return this.featureFlags[key] === true;
  }

  getFeatureFlagPayload(key: string): unknown {
    if (this.featureFlags[key] !== true) {
      return undefined;
    }
    return this.featureFlagPayloads[key];
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
        this.debug(`TraceIQ event rejected with ${response.status}.`);
      }
    } catch (error) {
      this.debug('TraceIQ event delivery failed.', error);
    }
  }

  private buildContext(): Record<string, unknown> {
    const location = this.getLocation();
    const navigator = this.getNavigator();
    const screen = this.getScreen();

    return {
      page: {
        url: location?.href,
        path: location?.pathname,
        search: location?.search,
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
    if (this.options?.debug) {
      console.warn(message, error ?? '');
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

import type { TraceIQClient, TraceIQGroup, TraceIQIdentity, TraceIQInitOptions } from '../types';

const DEFAULT_ENDPOINT = 'http://localhost:4000';
const ANONYMOUS_ID_STORAGE_KEY = 'traceiq.anonymousId';
const SESSION_ID_STORAGE_KEY = 'traceiq.sessionId';

export class BrowserTraceIQClient implements TraceIQClient {
  private options?: TraceIQInitOptions;
  private identity?: TraceIQIdentity;
  private groupContext?: TraceIQGroup;
  private anonymousId?: string;
  private sessionId?: string;

  initialize(options: TraceIQInitOptions): void {
    this.options = {
      ...options,
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT
    };
    this.anonymousId = this.loadOrCreateId('localStorage', ANONYMOUS_ID_STORAGE_KEY, 'anon');
    this.sessionId = this.loadOrCreateId('sessionStorage', SESSION_ID_STORAGE_KEY, 'sess');

    if (options.autoTrackPageViews) {
      this.page();
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
        name: '@traceiq/sdk-js',
        version: '0.1.0'
      },
      timezone: this.getTimezone()
    };
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

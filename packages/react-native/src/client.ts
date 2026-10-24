import { buildDeviceInfo, getAsyncStorage, onAppState } from './native';
import { MobileReplayRecorder, ReplayNode, ReplayViewport } from './replay';

export interface TraceIQInitOptions {
  projectId: string;
  writeKey: string;
  endpoint?: string;
  /** Your app's version, attached to device info. */
  appVersion?: string;
  flushAt?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  debug?: boolean;
  /** Flush the queue when the app goes to the background. Default true. */
  flushOnBackground?: boolean;
  onError?: (error: Error) => void;
  /** Mobile structural replay is opt-in and also requires grantReplayConsent(). */
  replay?: { enabled: boolean };
  /** Environment for flag evaluation and log lines. Default "production". */
  environment?: string;
  /** Service name stamped on log() lines. Default "mobile-app". */
  serviceName?: string;
  /** Record an exposure when a flag is read with isFeatureEnabled()/getFeatureFlagPayload(). Default true. */
  autoTrackFlagExposures?: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
const MAX_LOG_BATCH = 100; // API limit per /v1/logs/batch request
const MAX_QUEUED_LOGS = 1000;

export interface TraceIQFeatureFlags {
  flags: Record<string, boolean>;
  payloads: Record<string, unknown>;
  details?: Record<string, { enabled: boolean; reason: string; revision: number }>;
}

export interface CaptureParams {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string | Date;
}

export interface IdentifyParams {
  userId: string;
  traits?: Record<string, unknown>;
}

export interface GroupParams {
  organizationId: string;
  traits?: Record<string, unknown>;
}

interface QueuedEvent {
  eventName: string;
  sessionId: string;
  /** Local-only; never sent to the API. */
  generation: number;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
  deviceInfo?: Record<string, unknown>;
  timestamp: string;
}

const ANON_KEY = 'traceiq.anonymousId';
const DEFAULTS = { endpoint: 'http://localhost:4000', flushAt: 20, flushIntervalMs: 15_000, maxRetries: 3, timeoutMs: 10_000 };

/**
 * React Native / Expo client.
 *
 *   import { traceiq } from '@traceiq/react-native';
 *   traceiq.initialize({ projectId, writeKey });
 *   traceiq.screen('Wallet');
 *   traceiq.capture({ event: 'transfer_started', properties: { amount: 5000 } });
 */
export class TraceIQReactNative {
  private options?: Required<Omit<TraceIQInitOptions, 'onError' | 'appVersion' | 'replay' | 'autoTrackFlagExposures'>> &
    Pick<TraceIQInitOptions, 'onError' | 'appVersion' | 'replay'>;
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private removeAppStateListener: (() => void) | null = null;
  private userId?: string;
  private anonymousId: string = generateId('anon');
  private sessionId: string = generateId('ses');
  private deviceInfo: Record<string, unknown> = {};
  private replay?: MobileReplayRecorder;
  private flushing?: Promise<void>;
  private backgroundAt?: number;
  private identityGeneration = 0;
  private sessionHasEvents = false;
  private replayListeners = new Set<(recording: boolean) => void>();
  private logQueue: Array<Record<string, unknown>> = [];
  private featureFlags: TraceIQFeatureFlags = { flags: {}, payloads: {}, details: {} };
  private featureFlagsLoaded = false;
  private recordedExposures = new Set<string>();
  private autoTrackFlagExposures = true;

  initialize(options: TraceIQInitOptions): void {
    if (!options.projectId || !options.writeKey) {
      throw new Error('TraceIQ: projectId and writeKey are required.');
    }
    if (this.timer) clearInterval(this.timer);
    this.removeAppStateListener?.();
    this.replay?.stop();
    this.options = {
      projectId: options.projectId,
      writeKey: options.writeKey,
      endpoint: (options.endpoint ?? DEFAULTS.endpoint).replace(/\/$/, ''),
      appVersion: options.appVersion,
      flushAt: options.flushAt ?? DEFAULTS.flushAt,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      debug: options.debug ?? false,
      flushOnBackground: options.flushOnBackground ?? true,
      onError: options.onError,
      replay: options.replay,
      environment: options.environment ?? 'production',
      serviceName: options.serviceName ?? 'mobile-app'
    };
    this.autoTrackFlagExposures = options.autoTrackFlagExposures ?? true;

    this.deviceInfo = buildDeviceInfo(options.appVersion);
    void this.loadAnonymousId();

    if (this.options.flushIntervalMs > 0) {
      const timer = setInterval(() => void this.flush(), this.options.flushIntervalMs);
      (timer as unknown as { unref?: () => void }).unref?.();
      this.timer = timer;
    }
    this.replay = options.replay?.enabled ? new MobileReplayRecorder({
      projectId: options.projectId, writeKey: options.writeKey,
      endpoint: this.options.endpoint, timeoutMs: this.options.timeoutMs,
      onError: (error) => this.handleError(error),
      onStateChange: (recording) => this.replayListeners.forEach((listener) => listener(recording))
    }) : undefined;
    this.removeAppStateListener = onAppState((state) => {
      if (state === 'background') {
        this.backgroundAt = Date.now();
        this.replay?.appState(state);
        if (this.options?.flushOnBackground) void this.flush();
      } else {
        if (this.backgroundAt && Date.now() - this.backgroundAt > 30 * 60_000) {
          this.identityGeneration += 1;
          this.sessionId = generateId('ses');
          this.sessionHasEvents = false;
          this.replay?.stop();
        }
        this.backgroundAt = undefined;
        this.replay?.appState(state);
      }
    });
  }

  /** Track a screen view ($page event, matching web semantics). */
  screen(name: string, properties: Record<string, unknown> = {}): void {
    this.capture({ event: '$page', properties: { name, ...properties } });
    this.replay?.navigation(name);
  }

  capture(params: CaptureParams): void {
    if (!this.options) {
      this.debug('capture() before initialize(); ignored.');
      return;
    }
    if (!params.event) return;
    this.enqueue({
      eventName: params.event,
      properties: params.properties,
      timestamp: toIso(params.timestamp)
    });
  }

  identify(params: IdentifyParams): void {
    if (this.userId !== params.userId) {
      this.identityGeneration += 1;
      this.sessionId = generateId('ses');
      this.sessionHasEvents = false;
      this.replay?.stop();
    }
    this.userId = params.userId;
    this.enqueue({ eventName: '$identify', properties: { traits: params.traits ?? {} }, timestamp: toIso() });
  }

  group(params: GroupParams): void {
    this.enqueue({
      eventName: '$group',
      properties: { organizationId: params.organizationId, traits: params.traits ?? {} },
      timestamp: toIso()
    });
  }

  /** Clear the identified user (e.g. on logout). */
  reset(): void {
    this.identityGeneration += 1;
    this.replay?.stop();
    this.userId = undefined;
    this.anonymousId = generateId('anon');
    this.sessionId = generateId('ses');
    this.sessionHasEvents = false;
    // Flags were evaluated for the previous user; reload them for the new one.
    this.featureFlags = { flags: {}, payloads: {}, details: {} };
    this.featureFlagsLoaded = false;
    this.recordedExposures.clear();
    void this.persistAnonymousId();
  }

  /**
   * Send a structured log line to TraceIQ Logs, tagged with the session and user.
   * Pass `service` to override `serviceName` and `error` to attach an Error.
   */
  log(level: LogLevel, message: string, attributes: Record<string, unknown> = {}): void {
    if (!this.options) {
      this.debug('log() before initialize(); ignored.');
      return;
    }
    if (typeof message !== 'string' || !message.trim()) return;
    const { service, error, ...metadata } = attributes;
    const err = error instanceof Error ? error : undefined;
    this.logQueue.push({
      level: LOG_LEVELS.includes(level) ? level : 'info',
      message: message.slice(0, 4000),
      timestamp: toIso(),
      service: typeof service === 'string' && service ? service : this.options.serviceName,
      environment: this.options.environment,
      sessionId: this.sessionId,
      distinctId: this.userId ?? this.anonymousId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      errorDetails: err ? { name: err.name, message: err.message, stack: err.stack } : undefined
    });
    // Bounded so an offline device can't grow memory without limit; oldest go first.
    if (this.logQueue.length > MAX_QUEUED_LOGS) this.logQueue.splice(0, this.logQueue.length - MAX_QUEUED_LOGS);
    if (this.logQueue.length >= this.options.flushAt) void this.flush();
  }

  /**
   * Fetch every feature flag for the current user and cache it. Call after
   * initialize() and again after identify() or reset(). Keeps the last known flags
   * if the request fails.
   */
  async loadFeatureFlags(properties?: Record<string, unknown>): Promise<TraceIQFeatureFlags> {
    const options = this.options;
    if (!options) {
      this.debug('loadFeatureFlags() before initialize(); ignored.');
      return this.featureFlags;
    }
    try {
      const response = await this.post('/v1/flags/evaluate', {
        distinctId: this.userId ?? this.anonymousId,
        environment: options.environment,
        properties
      }, 0);
      if (!response?.ok) {
        this.debug(`flag evaluation failed${response ? ` with ${response.status}` : ''}.`);
        return this.featureFlags;
      }
      const body = (await response.json()) as Partial<TraceIQFeatureFlags>;
      this.featureFlags = { flags: body.flags ?? {}, payloads: body.payloads ?? {}, details: body.details ?? {} };
      this.featureFlagsLoaded = true;
    } catch (error) {
      this.debug(`flag evaluation failed: ${(error as Error).message}`);
    }
    return this.featureFlags;
  }

  /** True when the loaded flag is on; `defaultValue` until loadFeatureFlags() has succeeded. */
  isFeatureEnabled(key: string, defaultValue = false): boolean {
    if (!this.featureFlagsLoaded) return defaultValue;
    const enabled = this.featureFlags.flags[key] ?? defaultValue;
    if (this.autoTrackFlagExposures) this.recordFlagExposure(key);
    return enabled;
  }

  /** The loaded remote-config payload of a flag that is on, else `defaultValue`. */
  getFeatureFlagPayload<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (this.featureFlags.flags[key] !== true) return defaultValue;
    if (this.autoTrackFlagExposures) this.recordFlagExposure(key);
    return (this.featureFlags.payloads[key] as T) ?? defaultValue;
  }

  /** Record that the user saw a flag's value. Sent once per flag value and revision. */
  recordFlagExposure(key: string): void {
    const options = this.options;
    if (!options) return;
    const enabled = this.featureFlags.flags[key] === true;
    const detail = this.featureFlags.details?.[key];
    const distinctId = this.userId ?? this.anonymousId;
    const dedupKey = `${key}:${distinctId}:${detail?.revision ?? 1}:${enabled ? 1 : 0}`;
    if (this.recordedExposures.has(dedupKey)) return;
    this.recordedExposures.add(dedupKey);
    void this.post('/v1/flags/exposure', {
      flagKey: key,
      distinctId,
      userId: this.userId,
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      enabled,
      environment: options.environment,
      revision: detail?.revision ?? 1,
      evaluationReason: detail?.reason ?? (enabled ? 'sdk_enabled' : 'sdk_disabled')
    }, 0).catch((error: Error) => this.debug(`flag exposure failed: ${error.message}`));
  }

  /** Consent is never inferred from analytics consent or project settings. */
  grantReplayConsent(): void { this.replay?.grantConsent(); }
  revokeReplayConsent(): void { this.replay?.revokeConsent(); }
  get isReplayRecording(): boolean { return this.replay?.isRecording ?? false; }
  onReplayStateChange(listener: (recording: boolean) => void): () => void {
    this.replayListeners.add(listener);
    return () => this.replayListeners.delete(listener);
  }
  recordReplaySnapshot(screen: string, viewport: ReplayViewport, nodes: ReplayNode[]): void {
    this.replay?.snapshotView(screen, viewport, nodes);
  }
  clearReplaySnapshot(): void { this.replay?.clearView(); }
  recordReplayTap(x: number, y: number): void { this.replay?.tap(x, y); }
  recordReplayScroll(x: number, y: number, deltaX: number, deltaY: number): void {
    this.replay?.scroll(x, y, deltaX, deltaY);
  }
  async flushReplay(): Promise<void> { await this.replay?.flush(); }
  async completeReplay(): Promise<void> { await this.replay?.complete(); }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushQueued().finally(() => { this.flushing = undefined; });
    return this.flushing;
  }

  private async flushQueued(): Promise<void> {
    await this.flushEvents();
    while (this.options && this.logQueue.length > 0) {
      const logs = this.logQueue.splice(0, MAX_LOG_BATCH);
      try {
        const response = await this.post('/v1/logs/batch', { logs });
        if (response && !response.ok) this.handleError(new Error(`TraceIQ logs rejected with ${response.status}.`));
      } catch (error) {
        this.handleError(error instanceof Error ? error : new Error('TraceIQ log delivery failed.'));
      }
    }
  }

  private async flushEvents(): Promise<void> {
    while (this.options && this.queue.length > 0) {
      const batch = this.queue.splice(0, this.queue.length);
      const results = await this.send(batch);
      if (!results) continue;
      for (const [index, event] of batch.entries()) {
        if (results[index]?.accepted && event.anonymousId && this.identityGeneration === event.generation) {
          await this.replay?.acceptedEvent(event.eventName, {
            sessionId: event.sessionId, anonymousId: event.anonymousId, userId: event.userId
          });
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.removeAppStateListener) {
      this.removeAppStateListener();
      this.removeAppStateListener = null;
    }
    await this.flush();
    await this.replay?.complete();
  }

  private enqueue(event: Omit<QueuedEvent, 'sessionId' | 'generation'>): void {
    event.userId = this.userId;
    event.anonymousId = this.anonymousId;
    event.deviceInfo = this.deviceInfo;
    this.queue.push({ ...event, sessionId: this.sessionId, generation: this.identityGeneration });
    this.sessionHasEvents = true;
    if (this.options && this.queue.length >= this.options.flushAt) {
      void this.flush();
    }
  }

  private async send(batch: QueuedEvent[]): Promise<Array<{ accepted: boolean }> | undefined> {
    let response: Response | undefined;
    try {
      response = await this.post('/v1/events/batch', {
        batch: batch.map(({ generation: _generation, ...event }) => event)
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('TraceIQ batch delivery failed.'));
      return;
    }
    if (!response) return;
    if (!response.ok) {
      this.handleError(new Error(`TraceIQ batch rejected with ${response.status}.`));
      return;
    }
    const payload = await response.json() as { results?: Array<{ accepted?: boolean }> };
    if (!Array.isArray(payload.results) || payload.results.length !== batch.length) {
      this.handleError(new Error('TraceIQ batch response has no per-event acknowledgements.'));
      return;
    }
    return payload.results.map((result) => ({ accepted: result?.accepted === true }));
  }

  /**
   * POSTs `payload` (plus projectId) to an API path. Network errors, 429 and 5xx are
   * retried with backoff up to `retries` times; the last error is thrown. Other
   * responses are returned for the caller to inspect. Undefined when uninitialized.
   */
  private async post(
    path: string,
    payload: Record<string, unknown>,
    retries = this.options?.maxRetries ?? 0
  ): Promise<Response | undefined> {
    const options = this.options;
    if (!options) return;
    if (typeof fetch !== 'function') {
      this.handleError(new Error('No fetch available in this environment.'));
      return;
    }
    const body = JSON.stringify({ projectId: options.projectId, ...payload });

    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await fetch(`${options.endpoint}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-traceiq-write-key': options.writeKey },
          body,
          signal: controller.signal
        });
        if (response.ok || (response.status < 500 && response.status !== 429)) return response;
        throw new Error(`TraceIQ request failed with ${response.status}.`);
      } catch (error) {
        if (attempt > retries) throw error;
        await delay(backoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private async loadAnonymousId(): Promise<void> {
    const storage = getAsyncStorage();
    if (!storage) return;
    const generation = this.identityGeneration;
    try {
      const stored = await storage.getItem(ANON_KEY);
      if (stored) {
        if (this.identityGeneration === generation && !this.sessionHasEvents) this.anonymousId = stored;
      } else {
        await storage.setItem(ANON_KEY, this.anonymousId);
      }
    } catch (error) {
      this.debug(`anonymousId persistence unavailable: ${(error as Error).message}`);
    }
  }

  private async persistAnonymousId(): Promise<void> {
    const storage = getAsyncStorage();
    try {
      await storage?.setItem(ANON_KEY, this.anonymousId);
    } catch {
      /* best effort */
    }
  }

  private handleError(error: Error): void {
    this.debug(error.message);
    this.options?.onError?.(error);
  }

  private debug(message: string): void {
    if (this.options?.debug) {
      console.warn(`[traceiq] ${message}`);
    }
  }
}

function toIso(value?: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return new Date().toISOString();
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 30_000) + Math.floor(Math.random() * 250);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

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
  private options?: Required<Omit<TraceIQInitOptions, 'onError' | 'appVersion' | 'replay'>> &
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
      replay: options.replay
    };

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
    void this.persistAnonymousId();
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
    const options = this.options;
    if (!options) return;
    if (typeof fetch !== 'function') {
      this.handleError(new Error('No fetch available in this environment.'));
      return;
    }

    const url = `${options.endpoint}/v1/events/batch`;
    const body = JSON.stringify({ projectId: options.projectId,
      batch: batch.map(({ generation: _generation, ...event }) => event) });

    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-traceiq-write-key': options.writeKey },
          body,
          signal: controller.signal
        });
        if (response.ok) {
          const payload = await response.json() as { results?: Array<{ accepted?: boolean }> };
          if (!Array.isArray(payload.results) || payload.results.length !== batch.length) {
            this.handleError(new Error('TraceIQ batch response has no per-event acknowledgements.'));
            return;
          }
          return payload.results.map((result) => ({ accepted: result?.accepted === true }));
        }
        if (response.status < 500 && response.status !== 429) {
          this.handleError(new Error(`TraceIQ batch rejected with ${response.status}.`));
          return;
        }
        throw new Error(`TraceIQ batch failed with ${response.status}.`);
      } catch (error) {
        if (attempt > options.maxRetries) {
          this.handleError(error instanceof Error ? error : new Error('TraceIQ batch delivery failed.'));
          return;
        }
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

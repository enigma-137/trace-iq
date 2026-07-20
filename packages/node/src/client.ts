import { createRequestMiddleware, MiddlewareOptions } from './middleware';

export interface TraceIQNodeOptions {
  /** Your project ID (from Settings). */
  projectId: string;
  /** SDK write key. Server-side keys must be kept secret. */
  writeKey: string;
  /** TraceIQ API base URL. Defaults to http://localhost:4000. */
  endpoint?: string;
  /** Flush automatically once this many events are queued. Default 20. */
  flushAt?: number;
  /** Flush on a timer, in ms. Default 10000. Set 0 to disable the timer. */
  flushIntervalMs?: number;
  /** Network retries per flush before giving up. Default 3. */
  maxRetries?: number;
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Log warnings to the console. Default false. */
  debug?: boolean;
  /** Called when a batch is dropped after exhausting retries. */
  onError?: (error: Error) => void;
  /** Inject a fetch implementation (tests, or Node < 18 with a polyfill). */
  fetchImpl?: typeof fetch;
}

export interface CaptureParams {
  /** Event name, e.g. "payout_succeeded". */
  event: string;
  /** The identified user this event belongs to. */
  userId?: string;
  /** Anonymous identifier, when there is no user yet. */
  anonymousId?: string;
  /** Arbitrary event properties. Numeric `amount` powers revenue metrics. */
  properties?: Record<string, unknown>;
  /** Extra context (server, request id, …). */
  context?: Record<string, unknown>;
  /** When it happened. Defaults to now. */
  timestamp?: string | Date;
}

export interface IdentifyParams {
  userId: string;
  traits?: Record<string, unknown>;
  timestamp?: string | Date;
}

export interface GroupParams {
  organizationId: string;
  userId?: string;
  anonymousId?: string;
  traits?: Record<string, unknown>;
  timestamp?: string | Date;
}

interface QueuedEvent {
  eventName: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp: string;
}

const DEFAULTS = {
  endpoint: 'http://localhost:4000',
  flushAt: 20,
  flushIntervalMs: 10_000,
  maxRetries: 3,
  timeoutMs: 10_000
};

/**
 * Server-side TraceIQ client. Events are queued and flushed in batches
 * (by size or on a timer) so callers never block on the network.
 *
 *   const traceiq = new TraceIQ({ projectId, writeKey });
 *   traceiq.capture({ event: 'payout_succeeded', userId, properties: { amount: 5000 } });
 *   await traceiq.shutdown(); // flush before the process exits
 */
export class TraceIQ {
  private readonly options: Required<Omit<TraceIQNodeOptions, 'onError' | 'fetchImpl'>> &
    Pick<TraceIQNodeOptions, 'onError' | 'fetchImpl'>;
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TraceIQNodeOptions) {
    if (!options.projectId) throw new Error('TraceIQ: projectId is required.');
    if (!options.writeKey) throw new Error('TraceIQ: writeKey is required.');

    this.options = {
      projectId: options.projectId,
      writeKey: options.writeKey,
      endpoint: (options.endpoint ?? DEFAULTS.endpoint).replace(/\/$/, ''),
      flushAt: options.flushAt ?? DEFAULTS.flushAt,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULTS.flushIntervalMs,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      debug: options.debug ?? false,
      onError: options.onError,
      fetchImpl: options.fetchImpl
    };

    if (this.options.flushIntervalMs > 0) {
      const timer = setInterval(() => {
        void this.flush();
      }, this.options.flushIntervalMs);
      // Don't keep the Node process alive just for the flush timer.
      (timer as unknown as { unref?: () => void }).unref?.();
      this.timer = timer;
    }
  }

  /**
   * Express/connect middleware that emits a `$api_request` event per request
   * (method, path, status, durationMs) to power the API performance view.
   *
   *   app.use(traceiq.middleware({ resolveUserId: (req) => req.user?.id }));
   */
  middleware(options: MiddlewareOptions = {}) {
    return createRequestMiddleware(this, options);
  }

  /** Track a server-side event. */
  capture(params: CaptureParams): void {
    if (!params.event) {
      this.debug('capture() called without an event name; ignored.');
      return;
    }
    this.enqueue({
      eventName: params.event,
      userId: params.userId,
      anonymousId: params.anonymousId,
      properties: params.properties,
      context: params.context,
      timestamp: this.toIso(params.timestamp)
    });
  }

  /** Create or update a user profile (traits stored on the $identify event). */
  identify(params: IdentifyParams): void {
    this.enqueue({
      eventName: '$identify',
      userId: params.userId,
      properties: { traits: params.traits ?? {} },
      timestamp: this.toIso(params.timestamp)
    });
  }

  /** Associate a user with an organization / account. */
  group(params: GroupParams): void {
    this.enqueue({
      eventName: '$group',
      userId: params.userId,
      anonymousId: params.anonymousId,
      properties: { organizationId: params.organizationId, traits: params.traits ?? {} },
      timestamp: this.toIso(params.timestamp)
    });
  }

  /** Send everything queued right now. Safe to await. */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await this.send(batch);
  }

  /** Flush and stop the timer. Call before the process exits. */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private enqueue(event: QueuedEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.options.flushAt) {
      void this.flush();
    }
  }

  private async send(batch: QueuedEvent[]): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      this.handleError(new Error('No fetch implementation available. Use Node >= 18 or pass options.fetchImpl.'));
      return;
    }

    const url = `${this.options.endpoint}/v1/events/batch`;
    const body = JSON.stringify({ projectId: this.options.projectId, batch });

    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-traceiq-write-key': this.options.writeKey },
          body,
          signal: controller.signal
        });

        if (response.ok) return;

        // 4xx (except 429) means the request itself is bad — retrying won't help.
        if (response.status < 500 && response.status !== 429) {
          this.handleError(new Error(`TraceIQ batch rejected with ${response.status}.`));
          return;
        }
        throw new Error(`TraceIQ batch failed with ${response.status}.`);
      } catch (error) {
        if (attempt > this.options.maxRetries) {
          this.handleError(error instanceof Error ? error : new Error('TraceIQ batch delivery failed.'));
          return;
        }
        await this.delay(this.backoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    return base + Math.floor(Math.random() * 250); // jitter to avoid thundering herds
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toIso(value?: string | Date): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && value.length > 0) return value;
    return new Date().toISOString();
  }

  private handleError(error: Error): void {
    this.debug(error.message);
    this.options.onError?.(error);
  }

  private debug(message: string): void {
    if (this.options.debug) {
      console.warn(`[traceiq] ${message}`);
    }
  }
}

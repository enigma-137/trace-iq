import {
  createRequestMiddleware,
  getRequestContext,
  getTraceHeaders,
  installFetchTracePropagation,
  MiddlewareOptions,
  TracePropagationTargets
} from './middleware';

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
  /** Service name stamped on log() entries. Default "server". */
  serviceName?: string;
  /** Environment stamped on log() entries. Defaults to NODE_ENV, then "production". */
  environment?: string;
  /**
   * The version of your service that is running (a version number or git SHA), sent with every event
   * so errors show which release they first and last appeared in. Defaults to TRACEIQ_RELEASE.
   */
  release?: string;
  /**
   * Forward console.log/info/warn/error to TraceIQ Logs (the console still prints).
   * Inside traceiq.middleware() each line is tagged with the request's ids. Default false.
   */
  captureConsole?: boolean;
  /**
   * Add a W3C `traceparent` header to global fetch() calls made while handling a
   * request in traceiq.middleware(), so downstream services using the middleware
   * join the same trace and nest under it in the Requests waterfall. Off by default.
   * `true` sends it on every call; prefer a list of your own services' URLs (strings
   * match by substring, or RegExps) so third-party APIs don't receive trace ids.
   * Calls to TraceIQ itself are never touched. For other HTTP clients, use
   * traceiq.traceHeaders().
   */
  propagateTraceHeaders?: TracePropagationTargets | false;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

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

export interface AliasParams {
  /** The ID to keep. */
  userId: string;
  /** The other ID for the same person, e.g. a guest or legacy user ID. */
  previousId: string;
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
  private readonly options: Required<Omit<TraceIQNodeOptions, 'onError' | 'fetchImpl' | 'captureConsole' | 'propagateTraceHeaders' | 'release'>> &
    Pick<TraceIQNodeOptions, 'onError' | 'fetchImpl' | 'release'>;
  private queue: QueuedEvent[] = [];
  private logQueue: Array<Record<string, unknown>> = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private forwardingConsole = false;

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
      fetchImpl: options.fetchImpl,
      serviceName: options.serviceName ?? 'server',
      environment: options.environment ?? process.env.NODE_ENV ?? 'production',
      release: options.release || process.env.TRACEIQ_RELEASE || undefined
    };

    if (this.options.flushIntervalMs > 0) {
      const timer = setInterval(() => {
        void this.flush();
      }, this.options.flushIntervalMs);
      // Don't keep the Node process alive just for the flush timer.
      (timer as unknown as { unref?: () => void }).unref?.();
      this.timer = timer;
    }

    if (options.captureConsole) this.installConsoleCapture();
    if (options.propagateTraceHeaders) installFetchTracePropagation(options.propagateTraceHeaders, this.options.endpoint);
  }

  private installConsoleCapture(): void {
    const levels: Array<[keyof Console & string, LogLevel]> = [
      ['log', 'info'],
      ['info', 'info'],
      ['warn', 'warn'],
      ['error', 'error']
    ];
    const consoleRef = console as unknown as Record<string, (...args: unknown[]) => void>;
    for (const [method, level] of levels) {
      const original = consoleRef[method];
      if (typeof original !== 'function') continue;
      consoleRef[method] = (...args: unknown[]) => {
        original.apply(console, args);
        // Skip our own diagnostics and re-entrant calls so delivery can never loop.
        if (this.forwardingConsole || args.length === 0) return;
        if (typeof args[0] === 'string' && args[0].startsWith('[traceiq]')) return;
        this.forwardingConsole = true;
        try {
          const error = args.find((arg) => arg instanceof Error);
          this.log(level, args.map(formatConsoleArg).join(' '), error ? { error } : {});
        } catch {
          // Never let instrumentation break the app's own logging.
        } finally {
          this.forwardingConsole = false;
        }
      };
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

  /**
   * `{ traceparent }` for outgoing calls made while handling a request, so the
   * downstream service joins this trace; `{}` outside a request.
   *
   *   await axios.post(url, body, { headers: traceiq.traceHeaders() });
   */
  traceHeaders(): Record<string, string> {
    return getTraceHeaders();
  }

  /** Track a server-side event. */
  capture(params: CaptureParams): void {
    if (!params.event) {
      this.debug('capture() called without an event name; ignored.');
      return;
    }
    // Inside traceiq.middleware(), stamp the in-flight request's ids so errors and
    // events raised while handling it link back to that exact request record.
    const request = getRequestContext();
    const properties =
      request && params.properties?.requestId === undefined
        ? { ...params.properties, requestId: request.requestId, traceId: request.traceId }
        : params.properties;
    this.enqueue({
      eventName: params.event,
      userId: params.userId,
      anonymousId: params.anonymousId,
      properties,
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

  /**
   * Tell TraceIQ that `previousId` and `userId` are the same person, so their
   * events and profiles can be merged into `userId`.
   */
  alias(params: AliasParams): void {
    if (!params.userId || !params.previousId || params.userId === params.previousId) {
      this.debug('alias() needs two different IDs; ignored.');
      return;
    }
    this.enqueue({
      eventName: '$alias',
      userId: params.userId,
      properties: { previousId: params.previousId },
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
    const events = this.queue.splice(0, this.queue.length);
    const logs = this.logQueue.splice(0, this.logQueue.length);
    if (events.length > 0) await this.send('/v1/events/batch', { batch: events });
    // The logs endpoint takes at most 100 entries per request.
    for (let i = 0; i < logs.length; i += 100) {
      await this.send('/v1/logs/batch', { logs: logs.slice(i, i + 100) });
    }
  }

  /**
   * Send a structured log line to TraceIQ Logs. Inside traceiq.middleware() it is
   * tagged with the in-flight request's requestId/traceId, so it shows up on that
   * request in the Requests explorer. Pass `service` to override the service name
   * (defaults to `serviceName`), `userId` for the user, and `error` to attach a stack.
   *
   *   traceiq.log('error', 'Payout provider timed out', { provider: 'stripe', error });
   */
  log(level: LogLevel, message: string, attributes: Record<string, unknown> = {}): void {
    if (typeof message !== 'string' || !message.trim()) return;
    const { service, userId, error, ...metadata } = attributes;
    const request = getRequestContext();
    const err = error instanceof Error ? error : undefined;
    this.logQueue.push({
      level: LOG_LEVELS.includes(level) ? level : 'info',
      message: message.slice(0, 4000),
      timestamp: new Date().toISOString(),
      service: typeof service === 'string' && service ? service : this.options.serviceName,
      environment: this.options.environment,
      distinctId: typeof userId === 'string' ? userId : undefined,
      requestId: request?.requestId,
      traceId: request?.traceId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      errorDetails: err ? { name: err.name, message: err.message, stack: err.stack } : undefined
    });
    if (this.logQueue.length > 1000) this.logQueue.splice(0, this.logQueue.length - 1000);
    if (this.logQueue.length >= this.options.flushAt) void this.flush();
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
    if (this.options.release && event.context?.release === undefined) {
      event.context = { ...event.context, release: this.options.release };
    }
    this.queue.push(event);
    if (this.queue.length >= this.options.flushAt) {
      void this.flush();
    }
  }

  private async send(path: string, payload: Record<string, unknown>): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      this.handleError(new Error('No fetch implementation available. Use Node >= 18 or pass options.fetchImpl.'));
      return;
    }

    const url = `${this.options.endpoint}${path}`;
    const body = JSON.stringify({ projectId: this.options.projectId, ...payload });

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

  /**
   * Evaluates all feature flags for a given user identity and property set.
   */
  async evaluateFlags(params: {
    distinctId: string;
    properties?: Record<string, unknown>;
    environment?: string;
  }): Promise<{
    flags: Record<string, boolean>;
    payloads: Record<string, unknown>;
    details: Record<string, { enabled: boolean; reason: string; revision: number }>;
  }> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
    const url = `${this.options.endpoint}/v1/flags/evaluate`;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': this.options.writeKey,
          ...(params.environment ? { 'x-traceiq-environment': params.environment } : {})
        },
        body: JSON.stringify({
          projectId: this.options.projectId,
          distinctId: params.distinctId,
          properties: params.properties,
          environment: params.environment
        })
      });

      if (!response.ok) {
        this.debug(`evaluateFlags failed with ${response.status}`);
        return { flags: {}, payloads: {}, details: {} };
      }

      const data = (await response.json()) as {
        flags?: Record<string, boolean>;
        payloads?: Record<string, unknown>;
        details?: Record<string, { enabled: boolean; reason: string; revision: number }>;
      };

      return {
        flags: data.flags ?? {},
        payloads: data.payloads ?? {},
        details: data.details ?? {}
      };
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('TraceIQ flag evaluation error'));
      return { flags: {}, payloads: {}, details: {} };
    }
  }

  /**
   * Checks if a single feature flag is enabled for a user with safe fallback.
   */
  async isFeatureEnabled(
    key: string,
    distinctId: string,
    options?: {
      defaultValue?: boolean;
      properties?: Record<string, unknown>;
      environment?: string;
      trackExposure?: boolean;
    }
  ): Promise<boolean> {
    const res = await this.evaluateFlags({
      distinctId,
      properties: options?.properties,
      environment: options?.environment
    });
    const enabled = res.flags[key] ?? options?.defaultValue ?? false;

    if (options?.trackExposure !== false) {
      void this.trackFlagExposure({
        flagKey: key,
        distinctId,
        enabled,
        environment: options?.environment,
        properties: options?.properties
      });
    }

    return enabled;
  }

  /**
   * Retrieves the remote-config payload for a feature flag with safe fallback.
   */
  async getFeatureFlagPayload<T = unknown>(
    key: string,
    distinctId: string,
    options?: {
      defaultValue?: T;
      properties?: Record<string, unknown>;
      environment?: string;
      trackExposure?: boolean;
    }
  ): Promise<T | undefined> {
    const res = await this.evaluateFlags({
      distinctId,
      properties: options?.properties,
      environment: options?.environment
    });
    const isEnabled = res.flags[key] === true;

    if (options?.trackExposure !== false) {
      void this.trackFlagExposure({
        flagKey: key,
        distinctId,
        enabled: isEnabled,
        environment: options?.environment,
        properties: options?.properties
      });
    }

    if (!isEnabled) {
      return options?.defaultValue;
    }

    return (res.payloads[key] as T) ?? options?.defaultValue;
  }

  /**
   * Explicitly tracks a feature flag exposure from the server.
   */
  async trackFlagExposure(params: {
    flagKey: string;
    distinctId: string;
    enabled: boolean;
    environment?: string;
    properties?: Record<string, unknown>;
  }): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
    const url = `${this.options.endpoint}/v1/flags/exposure`;
    try {
      await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-traceiq-write-key': this.options.writeKey,
          ...(params.environment ? { 'x-traceiq-environment': params.environment } : {})
        },
        body: JSON.stringify({
          projectId: this.options.projectId,
          flagKey: params.flagKey,
          distinctId: params.distinctId,
          enabled: params.enabled,
          environment: params.environment ?? 'production',
          properties: params.properties
        })
      });
    } catch (error) {
      this.debug(`trackFlagExposure error: ${error instanceof Error ? error.message : String(error)}`);
    }
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

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === undefined) return 'undefined';
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

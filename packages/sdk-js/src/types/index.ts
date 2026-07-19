export interface TraceIQInitOptions {
  projectId: string;
  writeKey: string;
  endpoint?: string;
  autoTrackPageViews?: boolean;
  autoCaptureExceptions?: boolean;
  autoCaptureRageClicks?: boolean;
  enableReplay?: boolean;
  debug?: boolean;
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
}

export interface TraceIQClient {
  initialize(options: TraceIQInitOptions): void;
  identify(identity: TraceIQIdentity): void;
  track(eventName: string, properties?: Record<string, unknown>): void;
  page(name?: string, properties?: Record<string, unknown>): void;
  group(group: TraceIQGroup): void;
  captureException(error: unknown, properties?: Record<string, unknown>): void;
  /** Fetches this user's flag evaluations from the server and caches them. */
  loadFeatureFlags(): Promise<TraceIQFeatureFlags>;
  /** True only when the flag was loaded and is on for this user. */
  isFeatureEnabled(key: string): boolean;
  /** Remote-config payload for a flag, or undefined when off / not loaded / no payload. */
  getFeatureFlagPayload(key: string): unknown;
}

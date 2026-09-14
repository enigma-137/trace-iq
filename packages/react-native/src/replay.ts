import { getPlatform } from './native';

export type ReplayNodeKind = 'box' | 'text' | 'image' | 'icon' | 'input' | 'control' | 'blocked';
export interface ReplayFrame { x: number; y: number; width: number; height: number }
export interface ReplayNode { id: number; parentId?: number; kind: ReplayNodeKind; frame: ReplayFrame }
export interface ReplayViewport { width: number; height: number; orientation: 'portrait' | 'landscape' }
type Snapshot = { type: 'snapshot'; timestamp: number; screen: string; viewport: ReplayViewport; nodes: ReplayNode[] };
type ReplayEvent = Snapshot |
  { type: 'tap'; timestamp: number; x: number; y: number } |
  { type: 'scroll'; timestamp: number; x: number; y: number; deltaX: number; deltaY: number } |
  { type: 'navigation'; timestamp: number; screen: string } |
  { type: 'lifecycle'; timestamp: number; state: 'foreground' | 'background' };

interface Identity { sessionId: string; anonymousId: string; userId?: string }
interface ReplayConfig {
  enabled: boolean; sampleRate: number; maxDurationSeconds: number;
  flowTriggerEventNames: string[];
}
interface RecorderOptions {
  projectId: string; writeKey: string; endpoint: string; timeoutMs: number;
  onError: (error: Error) => void;
  onStateChange?: (recording: boolean) => void;
}

const SCREEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const MAX_EVENTS = 100;
const MAX_NODES = 2000;
const MAX_CHUNKS = 3000;
const MAX_CHUNK_JSON_BYTES = 350_000;

/** In-memory, consent-gated recorder. No UI content is read or persisted. */
export class MobileReplayRecorder {
  private consent = false;
  private config?: ReplayConfig;
  private loadingConfig?: Promise<void>;
  private identity?: Identity;
  private token?: string;
  private replayId?: string;
  private tokenExpiresAt = 0;
  private authorizing = false;
  private events: ReplayEvent[] = [];
  private snapshot?: Snapshot;
  private sequence = 0;
  private startedAt = 0;
  private lastTimestamp = 0;
  private eventBytes = 0;
  private epoch = 0;
  private requests = new Set<AbortController>();
  private uploading: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private foreground = true;

  constructor(private readonly options: RecorderOptions) {}

  get isRecording(): boolean { return Boolean(this.token && this.foreground); }

  grantConsent(): void {
    if (this.consent) return;
    this.consent = true;
    this.loadingConfig = this.fetchConfig();
  }

  revokeConsent(): void {
    this.consent = false;
    this.stop();
  }

  /** Identity changes and logout immediately discard unsent replay content. */
  stop(): void {
    const wasRecording = Boolean(this.token);
    this.epoch += 1;
    this.requests.forEach((controller) => controller.abort());
    this.requests.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.token = undefined;
    this.replayId = undefined;
    this.tokenExpiresAt = 0;
    this.authorizing = false;
    this.identity = undefined;
    this.events = [];
    this.snapshot = undefined;
    this.sequence = 0;
    this.startedAt = 0;
    this.lastTimestamp = 0;
    this.eventBytes = 0;
    if (wasRecording) this.options.onStateChange?.(false);
  }

  async acceptedEvent(eventName: string, identity: Identity): Promise<void> {
    if (!this.consent || this.token || this.authorizing || !this.foreground) return;
    const candidateEpoch = this.epoch;
    if (this.loadingConfig) await this.loadingConfig;
    const config = this.config;
    if (candidateEpoch !== this.epoch || !this.consent || !config?.enabled || !config.flowTriggerEventNames.includes(eventName)
      || !sampleSession(identity.sessionId, config.sampleRate) || !this.foreground) return;
    if (this.authorizing || (getPlatform().OS !== 'ios' && getPlatform().OS !== 'android')) return;
    this.authorizing = true;
    const epoch = this.epoch;
    try {
      const grant = await this.request('/authorize', 'POST', {
        projectId: this.options.projectId, ...identity, consentGranted: true,
        recordingFormat: 'mobile-structural-v1'
      }, this.options.writeKey) as { replayId?: string; token?: string; expiresAt?: string };
      if (epoch !== this.epoch || !this.consent || !this.foreground) return;
      const token = grant.token;
      if (!token || !grant.replayId) throw new Error('Replay authorization response is incomplete.');
      this.token = token;
      this.replayId = grant.replayId;
      this.tokenExpiresAt = Date.parse(grant.expiresAt ?? '') || 0;
      this.identity = { ...identity };
      this.startedAt = Date.now();
      this.options.onStateChange?.(true);
      this.timer = setInterval(() => void this.flush(), 5_000);
      (this.timer as unknown as { unref?: () => void }).unref?.();
    } catch (error) { if (epoch === this.epoch) this.options.onError(asError(error)); }
    finally { if (epoch === this.epoch) this.authorizing = false; }
  }

  snapshotView(screen: string, viewport: ReplayViewport, nodes: ReplayNode[]): void {
    if (!this.isRecording || !SCREEN.test(screen) || nodes.length > MAX_NODES
      || !validDimension(viewport.width) || !validDimension(viewport.height)
      || !['portrait', 'landscape'].includes(viewport.orientation)) return;
    const cleanNodes: ReplayNode[] = [];
    const blocked = new Set<number>();
    const seen = new Set<number>();
    for (const node of nodes) {
      if (!Number.isInteger(node.id) || node.id < 0 || seen.has(node.id)
        || (node.parentId !== undefined && (!seen.has(node.parentId) || blocked.has(node.parentId)))
        || !['box', 'text', 'image', 'icon', 'input', 'control', 'blocked'].includes(node.kind)
        || !validFrame(node.frame)) return;
      seen.add(node.id);
      if (node.kind === 'blocked') blocked.add(node.id);
      cleanNodes.push({ id: node.id, ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
        kind: node.kind, frame: { x: node.frame.x, y: node.frame.y,
          width: node.frame.width, height: node.frame.height } });
    }
    const snapshot: Snapshot = { type: 'snapshot', timestamp: Date.now(), screen,
      viewport: { width: viewport.width, height: viewport.height, orientation: viewport.orientation }, nodes: cleanNodes };
    this.snapshot = snapshot;
    this.append(snapshot);
  }

  clearView(): void { this.snapshot = undefined; }

  tap(x: number, y: number): void {
    if (this.safePoint(x, y)) this.append({ type: 'tap', timestamp: Date.now(), x, y });
  }

  scroll(x: number, y: number, deltaX: number, deltaY: number): void {
    if (this.safePoint(x, y) && validCoordinate(deltaX) && validCoordinate(deltaY)) {
      this.append({ type: 'scroll', timestamp: Date.now(), x, y, deltaX, deltaY });
    }
  }

  navigation(screen: string): void {
    if (this.isRecording && this.snapshot && SCREEN.test(screen)) {
      this.append({ type: 'navigation', timestamp: Date.now(), screen });
    }
  }

  appState(state: 'foreground' | 'background'): void {
    if (this.token && this.snapshot && this.foreground) {
      this.append({ type: 'lifecycle', timestamp: Date.now(), state });
    }
    this.foreground = state === 'foreground';
    if (state === 'background') void this.flush();
  }

  async flush(): Promise<void> {
    if (!this.token || !this.identity) return;
    if (!this.events.length) return this.uploading;
    const events = this.events;
    this.events = [];
    this.eventBytes = 0;
    const sequence = this.sequence++;
    const epoch = this.epoch;
    const identity = this.identity;
    this.uploading = this.uploading.then(async () => {
      if (epoch !== this.epoch) return;
      try {
        const token = await this.freshToken(epoch);
        if (!token || epoch !== this.epoch) return;
        await this.request('/chunks', 'POST', {
          projectId: this.options.projectId, ...identity, sequence,
          events: { format: 'mobile-structural-v1', version: 1, runtime: 'react-native',
            platform: getPlatform().OS, sequence, events }
        }, token);
      } catch (error) {
        if (epoch === this.epoch) { this.options.onError(asError(error)); this.stop(); }
      }
    });
    await this.uploading;
  }

  async complete(): Promise<void> {
    await this.flush();
    if (!this.token || !this.identity) return;
    const identity = this.identity;
    try {
      const token = await this.freshToken(this.epoch);
      if (!token) return;
      await this.request('/complete', 'POST', { projectId: this.options.projectId, ...identity,
        endedAt: new Date().toISOString() }, token);
    } catch (error) { this.options.onError(asError(error)); }
    this.stop();
  }

  private append(event: ReplayEvent): void {
    if (!this.isRecording || !this.snapshot || this.sequence >= MAX_CHUNKS) return;
    event.timestamp = Math.max(event.timestamp, this.lastTimestamp);
    this.lastTimestamp = event.timestamp;
    if (!this.events.length && event.type !== 'snapshot') {
      const prefix = { ...this.snapshot, timestamp: event.timestamp };
      this.events.push(prefix);
      this.eventBytes += JSON.stringify(prefix).length;
    }
    this.events.push(event);
    this.eventBytes += JSON.stringify(event).length;
    if (this.events.length >= MAX_EVENTS || this.eventBytes >= MAX_CHUNK_JSON_BYTES) void this.flush();
    if (Date.now() - this.startedAt >= (this.config?.maxDurationSeconds ?? 300) * 1000) void this.complete();
  }

  private safePoint(x: number, y: number): boolean {
    if (!this.isRecording || !this.snapshot || !validCoordinate(x) || !validCoordinate(y)) return false;
    const nodes = this.snapshot.nodes;
    if (nodes.some((node) => (node.kind === 'blocked' || node.kind === 'input') && contains(node.frame, x, y))) return false;
    return nodes.some((node) => node.kind !== 'box' && contains(node.frame, x, y));
  }

  private async fetchConfig(): Promise<void> {
    const epoch = this.epoch;
    try {
      const config = await this.request(`/config?projectId=${encodeURIComponent(this.options.projectId)}`,
        'GET', undefined, this.options.writeKey) as ReplayConfig;
      if (epoch === this.epoch && this.consent && config && Array.isArray(config.flowTriggerEventNames)) this.config = config;
    } catch (error) { this.options.onError(asError(error)); }
  }

  private async freshToken(epoch: number): Promise<string | undefined> {
    if (!this.token || !this.identity) return undefined;
    if (Date.now() < this.tokenExpiresAt - 30_000) return this.token;
    const grant = await this.request('/authorize', 'POST', {
      projectId: this.options.projectId, ...this.identity, replayId: this.replayId,
      consentGranted: true, recordingFormat: 'mobile-structural-v1'
    }, this.options.writeKey) as { token?: string; replayId?: string; expiresAt?: string };
    if (epoch !== this.epoch || !this.consent || !grant.token || grant.replayId !== this.replayId) return undefined;
    this.token = grant.token;
    this.tokenExpiresAt = Date.parse(grant.expiresAt ?? '') || 0;
    return grant.token;
  }

  private async request(path: string, method: 'GET' | 'POST', body: unknown, credential: string): Promise<unknown> {
    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${this.options.endpoint}/v1/replays${path}`, {
        method, headers: { 'content-type': 'application/json',
          [path.startsWith('/chunks') || path.startsWith('/complete') ? 'x-traceiq-replay-token' : 'x-traceiq-write-key']: credential },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal
      });
      if (!response.ok) throw new Error(`Replay ${path} rejected with ${response.status}.`);
      return response.json();
    } finally { clearTimeout(timeout); this.requests.delete(controller); }
  }
}

function validCoordinate(n: number): boolean { return Number.isFinite(n) && n >= -100000 && n <= 100000; }
function validDimension(n: number): boolean { return Number.isFinite(n) && n >= 0 && n <= 100000; }
function validFrame(frame: ReplayFrame): boolean {
  return Boolean(frame && validCoordinate(frame.x) && validCoordinate(frame.y)
    && validDimension(frame.width) && validDimension(frame.height));
}
function contains(frame: ReplayFrame, x: number, y: number): boolean {
  return x >= frame.x && y >= frame.y && x <= frame.x + frame.width && y <= frame.y + frame.height;
}
function asError(error: unknown): Error { return error instanceof Error ? error : new Error('Mobile replay request failed.'); }
export function sampleSession(sessionId: string, rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  let hash = 2166136261;
  for (let index = 0; index < sessionId.length; index += 1) {
    hash ^= sessionId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000 < rate;
}

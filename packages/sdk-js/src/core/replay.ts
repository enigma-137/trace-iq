import type { TraceIQReplayOptions, TraceIQReplayPrivacyMode } from '../types';
import { sanitizeTransportEvent } from './replay-privacy';

type RrwebEvent = { type: number; timestamp: number; data?: unknown };
interface RecorderConfig {
  enabled: boolean; sampleRate: number; maxDurationSeconds: number; privacyMode: TraceIQReplayPrivacyMode;
  requireConsent: boolean; maskSelectors: string[]; blockSelectors: string[]; ignoreSelectors: string[];
  flowTriggerEventNames: string[];
}
interface ReplayIdentity { projectId: string; writeKey: string; sessionId: string; anonymousId?: string; userId?: string; }
interface UploadGrant { token: string; expiresAt: string; replayId?: string; }

const MAX_BATCH_EVENTS = 150;
const MAX_BATCH_BYTES = 450_000;
const FLUSH_INTERVAL_MS = 5_000;
const FULL_SNAPSHOT_TYPE = 2;
const SENSITIVE_FRAME_URL = /(?:^|[\/_?&=.-])(?:auth|login|signin|sign-in|oauth|sso|payment|checkout|billing|card|password|mfa|2fa|otp)(?:$|[\/_?&=.-])/i;
const SENSITIVE_FRAME_SELECTOR = [
  'input[type="password"]', 'input[autocomplete="cc-number"]', 'input[autocomplete="cc-csc"]',
  'input[autocomplete="one-time-code"]', 'form[action*="checkout"]', 'form[action*="payment"]',
  'form[action*="login"]', 'form[action*="auth"]'
].join(',');
const BUILTIN_BLOCK = [
  '[data-traceiq-block]',
  'iframe:not([data-traceiq-replay-safe-frame="true"])',
  'input[type="password"]',
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-csc"]',
  'input[autocomplete="one-time-code"]',
  'form[action*="checkout"]'
];

export class ReplayRecorder {
  private stopRrweb?: () => void;
  private flushTimer?: ReturnType<typeof setInterval>;
  private durationTimer?: ReturnType<typeof setTimeout>;
  private buffer: RrwebEvent[] = [];
  private sequence = 0;
  private startedAt?: Date;
  private config?: RecorderConfig;
  private starting?: { epoch: number; promise: Promise<boolean> };
  private activating?: { epoch: number; promise: Promise<boolean> };
  private armedEpoch?: number;
  private acceptedEventNames: string[] = [];
  private lifecycleInstalled = false;
  private consentRevoked = false;
  private lifecycleEpoch = 0;
  private requests = new Set<AbortController>();
  private grant?: UploadGrant;
  private grantIdentity?: string;
  private replayId?: string;
  private safeFrames: Element[] = [];
  private safeFrameCleanups: Array<() => void> = [];
  private recordingEpoch?: number;

  constructor(
    private readonly endpoint: string,
    private readonly options: TraceIQReplayOptions,
    private readonly identity: () => ReplayIdentity | undefined,
    private readonly hasConsent: () => boolean,
    private readonly debug: (message: string, error?: unknown) => void
  ) {}

  start(): Promise<boolean> {
    if (this.consentRevoked) return Promise.resolve(false);
    if (this.stopRrweb || this.armedEpoch === this.lifecycleEpoch) return Promise.resolve(true);
    const epoch = this.lifecycleEpoch;
    if (this.starting?.epoch === epoch) return this.starting.promise;
    const promise = this.startInternal(epoch).finally(() => {
      if (this.starting?.epoch === epoch) this.starting = undefined;
    });
    this.starting = { epoch, promise };
    return promise;
  }

  stop({ discard = false }: { discard?: boolean } = {}) {
    const epoch = ++this.lifecycleEpoch;
    this.stopCapture();
    if (this.config && !this.consentRevoked) {
      this.armedEpoch = epoch;
    }
    if (discard) this.discardPending();
    else void this.flush(true, epoch).finally(() => this.complete(epoch));
  }

  grantConsent() {
    if (!this.consentRevoked && this.stopRrweb && this.hasConsent()) return Promise.resolve(true);
    this.stopCapture();
    this.discardPending();
    this.consentRevoked = false;
    this.lifecycleEpoch += 1;
    return this.start();
  }

  revokeConsent() {
    this.consentRevoked = true;
    this.lifecycleEpoch += 1;
    this.armedEpoch = undefined;
    this.stopCapture();
    this.discardPending();
  }

  eventAccepted(eventName: string) {
    if (typeof eventName !== 'string' || !eventName) return;
    this.acceptedEventNames.push(eventName);
    if (this.acceptedEventNames.length > 50) this.acceptedEventNames.shift();
    const epoch = this.lifecycleEpoch;
    if (!this.config?.flowTriggerEventNames.includes(eventName) || !this.isCurrent(epoch)) return;
    if (this.stopRrweb) {
      // The next upload grant will include every selected flow that the server
      // can now prove this session entered. The active recorder is reused.
      this.grant = undefined;
      this.grantIdentity = undefined;
      return;
    }
    if (this.armedEpoch === epoch) void this.activate(epoch);
  }

  private async startInternal(epoch: number): Promise<boolean> {
    if (typeof window === 'undefined' || !this.isCurrent(epoch)) return false;
    const identity = this.identity();
    if (!identity) return false;
    const controller = this.trackRequest();
    try {
      const response = await fetch(`${this.endpoint}/v1/replays/config?projectId=${encodeURIComponent(identity.projectId)}`, {
        headers: { 'x-traceiq-write-key': identity.writeKey }, credentials: 'omit', signal: controller.signal
      }).catch(() => undefined);
      if (!this.isCurrent(epoch) || !response?.ok) return false;
      const config = await response.json() as RecorderConfig;
      if (!this.isCurrent(epoch) || !config.enabled) return false;
      if (!Array.isArray(config.flowTriggerEventNames) || config.flowTriggerEventNames.length === 0) return false;
      const consentRequired = config.requireConsent || this.options.requireConsent === true;
      if (consentRequired && !this.hasConsent()) return false;
      const sampleRate = Math.min(config.sampleRate, this.validRate(this.options.sampleRate) ?? 1);
      if (!sampleSession(identity.sessionId, sampleRate)) return false;
      this.config = config;
      this.armedEpoch = epoch;
      this.installLifecycle();
      if (this.acceptedEventNames.some((eventName) => config.flowTriggerEventNames.includes(eventName))) {
        return this.activate(epoch);
      }
      return true;
    } finally {
      this.requests.delete(controller);
    }
  }

  private activate(epoch: number): Promise<boolean> {
    if (this.stopRrweb) return Promise.resolve(true);
    if (this.activating?.epoch === epoch) return this.activating.promise;
    const promise = this.activateInternal(epoch).finally(() => {
      if (this.activating?.epoch === epoch) this.activating = undefined;
    });
    this.activating = { epoch, promise };
    return promise;
  }

  private async activateInternal(epoch: number): Promise<boolean> {
    const config = this.config;
    const identity = this.identity();
    if (!config || !identity || this.armedEpoch !== epoch || !this.isCurrent(epoch)) return false;
    const consentRequired = config.requireConsent || this.options.requireConsent === true;
    if (consentRequired && !this.hasConsent()) return false;
    const controller = this.trackRequest();
    try {
      const grant = await this.requestUploadGrant(identity, config, epoch, controller.signal);
      if (!grant || !this.isCurrent(epoch, consentRequired)) return false;
      const { record } = await import('@rrweb/record');
      if (!this.isCurrent(epoch, consentRequired)) return false;
      this.grant = grant;
      this.grantIdentity = identityKey(identity);
      this.replayId = grant.replayId;
      this.startedAt = undefined;
      this.buffer = [];
      this.sequence = 0;
      if (!this.isCurrent(epoch, consentRequired)) return false;
      // rrweb's runtime indexes this map by the actual input type, although its
      // public type currently omits `hidden`. Keeping it here closes that gap.
      const maskInputOptions = {
        color: true, date: true, 'datetime-local': true, email: true, hidden: true, month: true,
        number: true, range: true, search: true, select: true, tel: true, text: true, textarea: true,
        time: true, url: true, week: true, password: true
      };
      this.markSafeSameOriginFrames();
      this.recordingEpoch = epoch;
      try {
        this.stopRrweb = record({
          emit: (event) => this.queue(event as RrwebEvent, epoch),
          maskAllInputs: false,
          maskInputOptions,
          maskTextSelector: this.maskSelector(config),
          blockSelector: joinSelectors(BUILTIN_BLOCK, config.blockSelectors, this.options.blockSelectors),
          // Ignore suppresses interaction events only. It is never a privacy boundary.
          ignoreSelector: joinSelectors(['[data-traceiq-ignore]'], config.ignoreSelectors, this.options.ignoreSelectors),
          // Preserve readable same-origin CSS in the snapshot. Images stay URL-based
          // and are neutralized by the playback projection instead of being inlined.
          inlineStylesheet: true, inlineImages: false,
          recordCanvas: false, recordCrossOriginIframes: false, collectFonts: false, checkoutEveryNms: 30_000,
          slimDOMOptions: { script: true, comment: true, headMetaDescKeywords: true, headMetaSocial: true,
            headMetaRobots: true, headMetaHttpEquiv: true, headMetaAuthorship: true, headMetaVerification: true }
        });
      } catch (error) {
        this.stopCapture();
        throw error;
      }
      if (!this.isCurrent(epoch, consentRequired)) {
        this.stopCapture();
        return false;
      }
      if (!this.stopRrweb) { this.stopCapture(); return false; }
      this.flushTimer = setInterval(() => void this.flush(false, epoch), FLUSH_INTERVAL_MS);
      this.durationTimer = setTimeout(() => this.stop(), config.maxDurationSeconds * 1_000);
      return true;
    } finally {
      this.requests.delete(controller);
    }
  }

  private queue(event: RrwebEvent, epoch: number) {
    if (this.recordingEpoch !== epoch || !this.isCurrent(epoch)) return;
    if (!this.startedAt && typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)) {
      this.startedAt = new Date(event.timestamp);
    }
    const safeEvent = sanitizeTransportEvent(event, this.config?.privacyMode ?? 'strict');
    if (safeEvent.type === FULL_SNAPSHOT_TYPE && this.buffer.length) void this.flush(false, epoch);
    this.buffer.push(safeEvent);
    if (safeEvent.type === FULL_SNAPSHOT_TYPE || this.buffer.length >= MAX_BATCH_EVENTS || estimateBytes(this.buffer) >= MAX_BATCH_BYTES) void this.flush(false, epoch);
  }

  private async flush(keepalive = false, epoch = this.lifecycleEpoch) {
    if (!this.buffer.length || !this.config || !this.isCurrent(epoch)) return;
    this.startedAt ??= new Date(this.buffer[0]?.timestamp ?? Date.now());
    const events = this.buffer;
    this.buffer = [];
    const sequence = this.sequence++;
    const identity = this.identity();
    if (!identity) return;
    const controller = this.trackRequest();
    try {
      const grant = await this.ensureUploadGrant(identity, this.config, epoch, controller.signal);
      if (!grant || !this.isCurrent(epoch)) return;
      const compressed = await gzipBase64(JSON.stringify(events));
      if (!this.isCurrent(epoch)) return;
      const base = { projectId: identity.projectId, sessionId: identity.sessionId, anonymousId: identity.anonymousId,
        userId: identity.userId, sequence, startedAt: this.startedAt.toISOString(),
        endedAt: new Date(events[events.length - 1]?.timestamp ?? Date.now()).toISOString() };
      const body = compressed ? JSON.stringify({ ...base, encoding: 'gzip-base64', encodedEvents: compressed }) : JSON.stringify({ ...base, events });
      if (!this.isCurrent(epoch)) return;
      const response = await fetch(`${this.endpoint}/v1/replays/chunks`, {
        method: 'POST', credentials: 'omit', keepalive: keepalive && body.length < 60_000,
        headers: { 'content-type': 'application/json', 'x-traceiq-replay-token': grant.token }, body,
        signal: controller.signal
      });
      if (!this.isCurrent(epoch)) return;
      if (!response.ok) this.debug(`TraceIQ replay chunk rejected with ${response.status}.`);
    } catch (error) {
      if (this.isCurrent(epoch)) this.debug('TraceIQ replay delivery failed.', error);
    } finally {
      this.requests.delete(controller);
    }
  }

  private async complete(epoch: number) {
    const identity = this.identity();
    if (!identity || !this.config || !this.isCurrent(epoch)) return;
    const controller = this.trackRequest();
    try {
      const grant = await this.ensureUploadGrant(identity, this.config, epoch, controller.signal);
      if (!grant || !this.isCurrent(epoch)) return;
      await fetch(`${this.endpoint}/v1/replays/complete`, {
        method: 'POST', credentials: 'omit', keepalive: true,
        headers: { 'content-type': 'application/json', 'x-traceiq-replay-token': grant.token },
        body: JSON.stringify({ projectId: identity.projectId, sessionId: identity.sessionId,
          replayId: this.replayId,
          anonymousId: identity.anonymousId, userId: identity.userId, endedAt: new Date().toISOString() }),
        signal: controller.signal
      }).catch(() => undefined);
    } finally {
      this.startedAt = undefined;
      this.grant = undefined;
      this.grantIdentity = undefined;
      this.replayId = undefined;
      this.requests.delete(controller);
    }
  }

  private async ensureUploadGrant(identity: ReplayIdentity, config: RecorderConfig, epoch: number, signal: AbortSignal) {
    const currentIdentity = identityKey(identity);
    if (this.grant && this.grantIdentity === currentIdentity
      && new Date(this.grant.expiresAt).getTime() > Date.now() + 15_000) return this.grant;
    const grant = await this.requestUploadGrant(identity, config, epoch, signal, this.replayId);
    if (!grant || !this.isCurrent(epoch)) return undefined;
    this.grant = grant;
    this.grantIdentity = currentIdentity;
    if (grant.replayId) this.replayId = grant.replayId;
    return grant;
  }

  private async requestUploadGrant(identity: ReplayIdentity, config: RecorderConfig, epoch: number, signal: AbortSignal, replayId?: string): Promise<UploadGrant | undefined> {
    if (!this.isCurrent(epoch)) return undefined;
    const response = await fetch(`${this.endpoint}/v1/replays/authorize`, {
      method: 'POST', credentials: 'omit', signal,
      headers: { 'content-type': 'application/json', 'x-traceiq-write-key': identity.writeKey },
      body: JSON.stringify({ projectId: identity.projectId, sessionId: identity.sessionId,
        replayId: replayId ?? this.replayId,
        anonymousId: identity.anonymousId, userId: identity.userId,
        consentGranted: this.hasConsent() })
    }).catch(() => undefined);
    if (!this.isCurrent(epoch) || !response?.ok) return undefined;
    const grant = await response.json() as UploadGrant;
    if (!this.isCurrent(epoch) || !grant.token || Number.isNaN(new Date(grant.expiresAt).getTime())) return undefined;
    return grant;
  }

  private trackRequest() {
    const controller = new AbortController();
    this.requests.add(controller);
    return controller;
  }

  private isCurrent(epoch: number, consentRequired = false) {
    return epoch === this.lifecycleEpoch && !this.consentRevoked && (!consentRequired || this.hasConsent());
  }

  private stopCapture() {
    this.stopRrweb?.();
    this.stopRrweb = undefined;
    this.recordingEpoch = undefined;
    for (const frame of this.safeFrames) frame.removeAttribute('data-traceiq-replay-safe-frame');
    this.safeFrames = [];
    for (const cleanup of this.safeFrameCleanups) cleanup();
    this.safeFrameCleanups = [];
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.durationTimer) clearTimeout(this.durationTimer);
    this.flushTimer = undefined;
    this.durationTimer = undefined;
  }

  private discardPending() {
    this.buffer = [];
    this.acceptedEventNames = [];
    this.startedAt = undefined;
    this.grant = undefined;
    this.grantIdentity = undefined;
    this.replayId = undefined;
    for (const request of this.requests) request.abort();
    this.requests.clear();
  }

  private maskSelector(config: RecorderConfig) {
    return config.privacyMode === 'strict' ? '*' : joinSelectors(['[data-traceiq-mask]'], config.maskSelectors, this.options.maskSelectors);
  }

  private installLifecycle() {
    if (this.lifecycleInstalled) return;
    this.lifecycleInstalled = true;
    const flush = () => void this.flush(true, this.lifecycleEpoch);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  }

  private markSafeSameOriginFrames() {
    this.safeFrames = [];
    this.safeFrameCleanups = [];
    if (typeof document.querySelectorAll !== 'function' || typeof location === 'undefined') return;
    for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-traceiq-allow-replay="true"]'))) {
      const source = frame.getAttribute('src') || location.href;
      try {
        const frameUrl = new URL(source, location.href);
        if (frameUrl.origin !== location.origin || SENSITIVE_FRAME_URL.test(`${frameUrl.pathname}${frameUrl.search}`)) continue;
        const validate = () => {
          try {
            const frameDocument = frame.contentDocument;
            if (!frameDocument || frameDocument.readyState === 'loading'
              || frameDocument.querySelector(SENSITIVE_FRAME_SELECTOR)) {
              frame.removeAttribute('data-traceiq-replay-safe-frame');
              return;
            }
            frame.setAttribute('data-traceiq-replay-safe-frame', 'true');
          } catch { frame.removeAttribute('data-traceiq-replay-safe-frame'); }
        };
        validate();
        frame.addEventListener('load', validate, true);
        this.safeFrameCleanups.push(() => frame.removeEventListener('load', validate, true));
        this.safeFrames.push(frame);
      } catch { /* malformed URLs stay blocked */ }
    }
  }

  private validRate(value: number | undefined) { return typeof value === 'number' && value >= 0 && value <= 1 ? value : undefined; }
}

function joinSelectors(...groups: Array<string[] | undefined>) {
  return [...new Set(groups.flatMap((group) => group ?? []).filter((selector) => selector && validSelector(selector)))].join(',');
}
function validSelector(selector: string) {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return true;
  try { document.querySelector(selector); return true; } catch { return false; }
}
function identityKey(identity: ReplayIdentity) {
  return JSON.stringify([identity.projectId, identity.sessionId, identity.anonymousId ?? null, identity.userId ?? null]);
}
function estimateBytes(events: RrwebEvent[]) { try { return new Blob([JSON.stringify(events)]).size; } catch { return JSON.stringify(events).length; } }
function sampleSession(sessionId: string, rate: number) {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  let hash = 2166136261;
  for (let index = 0; index < sessionId.length; index += 1) { hash ^= sessionId.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 0x1_0000_0000 < rate;
}

async function gzipBase64(value: string): Promise<string | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined;
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export { sampleSession };

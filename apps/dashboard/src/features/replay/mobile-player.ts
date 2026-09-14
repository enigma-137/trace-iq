import type { MobileReplayEventV1 } from '@traceiq/types';

export interface MobilePlaybackPage {
  recordingFormat?: string;
  recordingVersion?: string;
  runtime?: string;
  platform?: string;
  events: unknown[];
  nextCursor: number | null;
  done: boolean;
}

export interface MobilePlayback {
  runtime: 'react-native' | 'flutter';
  platform: 'ios' | 'android';
  events: MobileReplayEventV1[];
}

export interface MobileFrame {
  snapshot: Extract<MobileReplayEventV1, { type: 'snapshot' }>;
  screen: string;
  transitioning: boolean;
  background: boolean;
  tap?: { x: number; y: number };
  scroll?: { x: number; y: number; deltaX: number; deltaY: number };
  eventIndex: number;
}

const MAX_EVENTS = 50_000;
const MAX_PAGES = 300;
const SCREEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const KINDS = new Set(['box', 'text', 'image', 'icon', 'input', 'control', 'blocked']);

/** Playback API validates storage; this second boundary prevents malformed UI state. */
export async function loadMobilePlayback(
  first: MobilePlaybackPage,
  loadPage: (cursor: number) => Promise<MobilePlaybackPage>
): Promise<MobilePlayback> {
  const runtime = first.runtime;
  const platform = first.platform;
  if ((runtime !== 'react-native' && runtime !== 'flutter') ||
    (platform !== 'ios' && platform !== 'android')) throw new Error('Mobile replay metadata is incomplete.');
  const events: MobileReplayEventV1[] = [];
  let page = first;
  let previousCursor = -1;
  let previousTimestamp = -1;
  let blockedFrames: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    if (page.recordingFormat !== 'mobile-structural-v1' || page.recordingVersion !== '1' ||
      page.runtime !== runtime || page.platform !== platform || !Array.isArray(page.events)) {
      throw new Error('Mobile replay pages have inconsistent metadata.');
    }
    for (const raw of page.events) {
      if (!isMobileEvent(raw) || raw.timestamp < previousTimestamp) {
        throw new Error('Mobile replay contains an invalid or unordered event.');
      }
      if (raw.type === 'snapshot') {
        blockedFrames = raw.nodes.filter((node) => node.kind === 'blocked').map((node) => node.frame);
      } else if ((raw.type === 'tap' || raw.type === 'scroll') && blockedFrames.some((frame) =>
        raw.x >= frame.x && raw.y >= frame.y && raw.x <= frame.x + frame.width && raw.y <= frame.y + frame.height)) {
        throw new Error('Mobile replay contains an interaction in a blocked region.');
      }
      previousTimestamp = raw.timestamp;
      events.push(raw);
      if (events.length > MAX_EVENTS) throw new Error('Mobile replay is too large for this player.');
    }
    if (page.nextCursor === null) {
      if (!page.done) throw new Error('Mobile replay pagination ended unexpectedly.');
      if (events[0]?.type !== 'snapshot') throw new Error('Mobile replay has no opening snapshot.');
      return { runtime, platform, events };
    }
    if (!Number.isInteger(page.nextCursor) || page.nextCursor <= previousCursor || page.done) {
      throw new Error('Mobile replay pagination is invalid.');
    }
    previousCursor = page.nextCursor;
    page = await loadPage(previousCursor);
  }
  throw new Error('Mobile replay exceeds the page limit.');
}

export function mobileFrameAt(events: MobileReplayEventV1[], at: number): MobileFrame | null {
  if (!events.length || events[0].type !== 'snapshot') return null;
  let lo = 0;
  let hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].timestamp <= at) lo = mid + 1;
    else hi = mid - 1;
  }
  const index = Math.max(0, hi);
  let snapshot: Extract<MobileReplayEventV1, { type: 'snapshot' }> | undefined;
  let screen: string | undefined;
  let transitioning = false;
  let background = false;
  let tap: MobileFrame['tap'];
  let scroll: MobileFrame['scroll'];
  for (let i = index; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'snapshot') { snapshot = event; screen ??= event.screen; break; }
    if (event.type === 'navigation' && !screen) { screen = event.screen; transitioning = true; }
    if (event.type === 'lifecycle' && i === index) background = event.state === 'background';
    if (at - event.timestamp <= 650 && event.type === 'tap' && !tap) tap = { x: event.x, y: event.y };
    if (at - event.timestamp <= 650 && event.type === 'scroll' && !scroll) {
      scroll = { x: event.x, y: event.y, deltaX: event.deltaX, deltaY: event.deltaY };
    }
  }
  if (!snapshot) return null;
  // Lifecycle is sticky across snapshots; a foreground event resumes the view.
  for (let i = index; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'lifecycle') {
      background = event.state === 'background';
      break;
    }
  }
  return { snapshot, screen: screen ?? snapshot.screen, transitioning, background, tap, scroll, eventIndex: index };
}

function isMobileEvent(value: unknown): value is MobileReplayEventV1 {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (!integer(event.timestamp) || event.timestamp > 4_102_444_800_000) return false;
  if (event.type === 'snapshot') {
    const viewport = event.viewport as Record<string, unknown> | undefined;
    const seen = new Set<number>();
    const blocked = new Set<number>();
    return onlyKeys(event, ['type', 'timestamp', 'screen', 'viewport', 'nodes']) &&
      typeof event.screen === 'string' && SCREEN.test(event.screen) &&
      !!viewport && dimension(viewport.width) && dimension(viewport.height) &&
      onlyKeys(viewport, ['width', 'height', 'orientation']) &&
      (viewport.orientation === 'portrait' || viewport.orientation === 'landscape') &&
      Array.isArray(event.nodes) && event.nodes.length <= 2000 && event.nodes.every((raw: unknown) => {
        if (!raw || typeof raw !== 'object') return false;
        const node = raw as Record<string, unknown>;
        const frame = node.frame as Record<string, unknown> | undefined;
        if (!onlyKeys(node, ['id', 'parentId', 'kind', 'frame']) || !integer(node.id) ||
          seen.has(node.id) || (node.parentId !== undefined &&
            (!integer(node.parentId) || !seen.has(node.parentId) || blocked.has(node.parentId))) ||
          !KINDS.has(String(node.kind)) || !frame || !onlyKeys(frame, ['x', 'y', 'width', 'height']) ||
          !coordinate(frame.x) || !coordinate(frame.y) || !dimension(frame.width) || !dimension(frame.height)) return false;
        seen.add(node.id);
        if (node.kind === 'blocked') blocked.add(node.id);
        return true;
      });
  }
  if (event.type === 'tap') return onlyKeys(event, ['type', 'timestamp', 'x', 'y']) && coordinate(event.x) && coordinate(event.y);
  if (event.type === 'scroll') return onlyKeys(event, ['type', 'timestamp', 'x', 'y', 'deltaX', 'deltaY']) &&
    coordinate(event.x) && coordinate(event.y) &&
    coordinate(event.deltaX) && coordinate(event.deltaY);
  if (event.type === 'navigation') return onlyKeys(event, ['type', 'timestamp', 'screen']) &&
    typeof event.screen === 'string' && SCREEN.test(event.screen);
  if (event.type === 'lifecycle') return onlyKeys(event, ['type', 'timestamp', 'state']) &&
    (event.state === 'foreground' || event.state === 'background');
  return false;
}

function integer(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0; }
function coordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -100_000 && value <= 100_000;
}
function dimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

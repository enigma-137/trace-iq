import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadMobilePlayback, mobileFrameAt, type MobilePlaybackPage } from '../src/features/replay/mobile-player';

const snapshot = (timestamp: number, screen = 'Checkout') => ({
  type: 'snapshot', timestamp, screen,
  viewport: { width: 390, height: 844, orientation: 'portrait' },
  nodes: [
    { id: 0, kind: 'box', frame: { x: 0, y: 0, width: 390, height: 844 } },
    { id: 1, kind: 'blocked', frame: { x: 100, y: 100, width: 100, height: 50 } }
  ]
});
const page = (events: unknown[], nextCursor: number | null): MobilePlaybackPage => ({
  recordingFormat: 'mobile-structural-v1', recordingVersion: '1', runtime: 'flutter', platform: 'ios',
  events, nextCursor, done: nextCursor === null
});

describe('mobile structural player model', () => {
  it('loads bounded pages and reconstructs snapshot, navigation and lifecycle state', async () => {
    const first = page([snapshot(1000), { type: 'tap', timestamp: 1100, x: 30, y: 40 }], 0);
    const second = page([
      snapshot(1200, 'Review'), { type: 'navigation', timestamp: 1250, screen: 'Confirm' },
      { type: 'lifecycle', timestamp: 1300, state: 'background' },
      { type: 'lifecycle', timestamp: 1400, state: 'foreground' }
    ], null);
    const playback = await loadMobilePlayback(first, async (cursor) => {
      expect(cursor).toBe(0);
      return second;
    });
    expect(playback.events).toHaveLength(6);
    expect(mobileFrameAt(playback.events, 1150)?.tap).toEqual({ x: 30, y: 40 });
    expect(mobileFrameAt(playback.events, 1270)).toMatchObject({ screen: 'Confirm', transitioning: true });
    expect(mobileFrameAt(playback.events, 1350)?.background).toBe(true);
    expect(mobileFrameAt(playback.events, 1450)?.background).toBe(false);
  });

  it('fails closed on malformed pages, event content and pagination', async () => {
    await expect(loadMobilePlayback(page([snapshot(1000), { type: 'tap', timestamp: 900, x: 1, y: 1 }], null),
      async () => page([], null))).rejects.toThrow('invalid or unordered');
    await expect(loadMobilePlayback(page([{ ...snapshot(1000), nodes: [{ id: 1, kind: 'text', frame: { x: 0, y: 0, width: 1, height: 1 }, value: 'private' }] }], null),
      async () => page([], null))).rejects.toThrow('invalid or unordered');
    await expect(loadMobilePlayback(page([snapshot(1000), { type: 'tap', timestamp: 1100, x: 120, y: 120 }], null),
      async () => page([], null))).rejects.toThrow('blocked region');
    await expect(loadMobilePlayback(page([snapshot(1000)], 0), async () => page([snapshot(1100)], 0)))
      .rejects.toThrow('pagination is invalid');
    await expect(loadMobilePlayback({ ...page([snapshot(1000)], null), runtime: 'browser' }, async () => page([], null)))
      .rejects.toThrow('metadata');
  });

  it('never mounts replay content as HTML, images or a remote asset', () => {
    const source = readFileSync(new URL('../src/app/dashboard/replays/[id]/MobileReplayPlayer.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toMatch(/<img\b|<image\b|foreignObject|href=|src=/i);
    expect(source).toContain('Shapes are placeholders only.');
  });
});

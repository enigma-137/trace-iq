import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToastSnapshot, subscribeToToasts, toast } from '../src/lib/toast';

describe('TraceIQ toast store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.useFakeTimers();
    toast.dismissAll();
  });

  afterEach(() => {
    toast.dismissAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('publishes and manually dismisses typed notifications', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToasts(listener);
    const id = toast.warning('Review this setting.', { durationMs: null });

    expect(getToastSnapshot()).toEqual([
      expect.objectContaining({ id, tone: 'warning', message: 'Review this setting.' })
    ]);
    toast.dismiss(id);
    expect(getToastSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('auto-dismisses notifications and bounds the visible queue', () => {
    for (let index = 0; index < 6; index += 1) {
      toast.success(`Saved ${index}`, { durationMs: 1_000 });
    }

    expect(getToastSnapshot()).toHaveLength(5);
    expect(getToastSnapshot()[0]?.message).toBe('Saved 1');

    vi.advanceTimersByTime(1_000);
    expect(getToastSnapshot()).toEqual([]);
  });
});

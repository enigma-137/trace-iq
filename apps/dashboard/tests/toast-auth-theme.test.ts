import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getToastSnapshot, isAlwaysLightPath, toast } from '../src/lib/toast';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('toasts from signing in or up', () => {
  afterEach(() => {
    toast.dismissAll();
    vi.unstubAllGlobals();
  });

  it('knows which pages are always light', () => {
    expect(isAlwaysLightPath('/auth/login')).toBe(true);
    expect(isAlwaysLightPath('/auth/reset-password')).toBe(true);
    expect(isAlwaysLightPath('/auth')).toBe(true);
    expect(isAlwaysLightPath('/authors')).toBe(false);
    expect(isAlwaysLightPath('/dashboard')).toBe(false);
    expect(isAlwaysLightPath(null)).toBe(false);
  });

  it('marks a toast light when raised on a sign-in page, and keeps that after moving on', () => {
    const location = { pathname: '/auth/login' };
    vi.stubGlobal('window', { location });
    toast.success('Welcome back.', { durationMs: null });
    location.pathname = '/dashboard';
    toast.error('Something else.', { durationMs: null });
    toast.success('Signed in with GitHub.', { durationMs: null, light: true });
    expect(getToastSnapshot().map((item) => item.light ?? false)).toEqual([true, false, true]);
  });

  it('draws light toasts without their dark variants, and the GitHub sign-in toast asks for light', () => {
    const provider = read('components/TraceIQToastProvider.tsx');
    expect(provider).toContain('(toastItem.light ? lightOnly(classes) : classes)');
    expect(provider).toContain(".filter((name) => name && !name.startsWith('dark:'))");
    const item = provider.slice(provider.indexOf('function ToastItem'));
    expect(item).not.toMatch(/className="[^"]*dark:/);
    expect(read('components/SignedInToast.tsx')).toContain("{ title: 'Signed in', light: true }");
  });
});

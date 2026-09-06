export type ToastTone = 'success' | 'warning' | 'error';

export interface TraceIQToast {
  id: string;
  tone: ToastTone;
  title?: string;
  message: string;
}

export interface ToastOptions {
  title?: string;
  /** Use null to keep the toast visible until it is dismissed. */
  durationMs?: number | null;
}

type ToastListener = () => void;

const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  success: 4_000,
  warning: 6_000,
  error: 8_000
};
const MAX_VISIBLE_TOASTS = 5;
const EMPTY_TOASTS: readonly TraceIQToast[] = [];

let nextId = 0;
let snapshot: readonly TraceIQToast[] = EMPTY_TOASTS;
const listeners = new Set<ToastListener>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((listener) => listener());
}

function clearDismissTimer(id: string) {
  const timer = dismissTimers.get(id);
  if (timer) clearTimeout(timer);
  dismissTimers.delete(id);
}

function removeToast(id: string) {
  const next = snapshot.filter((item) => item.id !== id);
  if (next.length === snapshot.length) return;

  clearDismissTimer(id);
  snapshot = next;
  emit();
}

function showToast(tone: ToastTone, message: string, options: ToastOptions = {}) {
  if (typeof window === 'undefined') return '';

  const normalizedMessage = message.trim();
  if (!normalizedMessage) return '';

  const id = `traceiq-toast-${Date.now()}-${nextId++}`;
  const next = [...snapshot, { id, tone, title: options.title, message: normalizedMessage }];

  while (next.length > MAX_VISIBLE_TOASTS) {
    const removed = next.shift();
    if (removed) clearDismissTimer(removed.id);
  }

  snapshot = next;
  emit();

  const durationMs = options.durationMs === undefined ? DEFAULT_DURATION_MS[tone] : options.durationMs;
  if (durationMs !== null && Number.isFinite(durationMs) && durationMs > 0) {
    dismissTimers.set(id, setTimeout(() => removeToast(id), durationMs));
  }

  return id;
}

/**
 * Stable TraceIQ notification API. Feature components should use this helper
 * instead of importing a toast-rendering library directly.
 */
export const toast = {
  success(message: string, options?: ToastOptions) {
    return showToast('success', message, options);
  },
  warning(message: string, options?: ToastOptions) {
    return showToast('warning', message, options);
  },
  error(message: string, options?: ToastOptions) {
    return showToast('error', message, options);
  },
  dismiss(id: string) {
    removeToast(id);
  },
  dismissAll() {
    snapshot.forEach((item) => clearDismissTimer(item.id));
    snapshot = EMPTY_TOASTS;
    emit();
  }
};

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot() {
  return snapshot;
}

export function getServerToastSnapshot() {
  return EMPTY_TOASTS;
}

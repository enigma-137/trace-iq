'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Combobox } from '@traceiq/ui';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface FunnelFormProps {
  eventNames: Array<{ eventName: string; total: number; actors?: number }>;
  funnel?: {
    id: string;
    name: string;
    steps: Array<{ eventName: string }>;
  };
  initialTemplate?: { name: string; steps: string[] };
  onSuccess?: () => void;
  onCancel?: () => void;
}

const TEMPLATE_FUNNELS = [
  {
    name: 'User Onboarding Flow',
    description: 'Track visitor conversion from landing page to active user.',
    steps: ['page_view', 'signup_started', 'signup_completed', 'dashboard_view']
  },
  {
    name: 'Product Checkout Journey',
    description: 'Measure drop-offs during product discovery and purchasing.',
    steps: ['product_view', 'add_to_cart', 'checkout_started', 'purchase_completed']
  },
  {
    name: 'Feature Activation',
    description: 'Analyze adoption from feature discovery to first usage.',
    steps: ['feature_discovered', 'feature_configured', 'feature_used']
  }
];

export function FunnelForm({ eventNames, funnel, initialTemplate, onSuccess, onCancel }: FunnelFormProps) {
  const isEdit = Boolean(funnel);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [name, setName] = useState(
    funnel?.name ?? initialTemplate?.name ?? ''
  );
  const [steps, setSteps] = useState<string[]>(
    funnel?.steps.map((s) => s.eventName) ?? initialTemplate?.steps ?? ['', '']
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const observedEvents = useMemo(
    () => new Map(eventNames.map((entry) => [entry.eventName, entry])),
    [eventNames]
  );

  function applyTemplate(tpl: { name: string; steps: string[] }) {
    setName(tpl.name);
    setSteps(tpl.steps);
    setError(null);
  }

  function updateStep(index: number, value: string) {
    setSteps((current) => current.map((step, i) => (i === index ? value : step)));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  }

  function stepWarning(eventName: string): string | null {
    const cleaned = eventName.trim();
    if (cleaned.length === 0) return null;

    const entry = observedEvents.get(cleaned);
    if (!entry) {
      return 'No events with this exact name exist in the last 30 days. Matches are case-sensitive.';
    }

    const trackable = entry.actors ?? entry.total;
    if (trackable === 0) {
      return `${entry.total.toLocaleString()} events exist, but none have a trackable user ID (userId or anonymousId).`;
    }

    return null;
  }

  function addStep() {
    setSteps((current) => [...current, '']);
  }

  function removeStep(index: number) {
    setSteps((current) => (current.length <= 2 ? current : current.filter((_, i) => i !== index)));
  }

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanedSteps = steps.map((step) => step.trim()).filter(Boolean);
    if (!name.trim()) {
      setError('Please give the funnel a descriptive name.');
      return;
    }
    if (cleanedSteps.length < 2) {
      setError('Add at least two sequential event steps.');
      return;
    }

    setIsSubmitting(true);
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/funnels${isEdit ? `/${funnel!.id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), steps: cleanedSteps })
      });

      if (!response.ok) {
        setError(await readError(response));
        setIsSubmitting(false);
        return;
      }

      const result = (await response.json()) as { id: string };
      toast.success(
        isEdit ? `Funnel "${name.trim()}" updated successfully.` : `Funnel "${name.trim()}" created successfully.`,
        { title: isEdit ? 'Funnel updated' : 'Funnel created' }
      );
      if (onSuccess) {
        onSuccess();
      }
      router.push(`/dashboard/funnels/${isEdit ? funnel!.id : result.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save funnel.');
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!funnel || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/funnels/${funnel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await readError(response));
      setIsDeleteOpen(false);
      toast.success(`Funnel "${funnel.name}" was deleted.`, { title: 'Funnel deleted' });
      router.push('/dashboard/funnels');
      router.refresh();
    } catch (caughtError) {
      const message = await readApiError(caughtError, 'Could not delete funnel.');
      setError(message);
      setDeleteError(message);
      toast.error(message, { title: 'Funnel deletion failed' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Template Quick Starter (if creating new) */}
      {!isEdit && (
        <div className="rounded-lg border border-neutral-200/80 bg-neutral-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500 dark:text-slate-400">
            Starter Flow Presets
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATE_FUNNELS.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              >
                <span>{tpl.name}</span>
                <span className="text-[10px] text-neutral-400">({tpl.steps.length} steps)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Funnel Name */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-[0.08em] text-neutral-700 dark:text-slate-300">
          1. Funnel Name
        </label>
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          Give this conversion flow a clear, descriptive name to easily identify it.
        </p>
        <input
          type="text"
          className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-xs text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Onboarding to Paid Subscription"
        />
      </div>

      {/* Step 2: Ordered Event Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.08em] text-neutral-700 dark:text-slate-300">
              2. Ordered Event Steps
            </label>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Add the sequential actions a user must perform. Conversion is evaluated in order.
            </p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Add Step
          </button>
        </div>

        <div className="space-y-2.5">
          {steps.map((step, index) => {
            const warning = stepWarning(step);
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;

            return (
              <div
                key={index}
                className="group rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition hover:border-neutral-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  {/* Step Order Badge */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 font-mono text-xs font-bold text-neutral-700 dark:bg-slate-900 dark:text-slate-300">
                    {index + 1}
                  </div>

                  {/* Event Combobox */}
                  <div className="min-w-0 flex-1">
                    <Combobox
                      items={eventNames.map((entry) => ({
                        value: entry.eventName,
                        label: entry.eventName,
                        description: `${entry.total.toLocaleString()} total · ${(entry.actors ?? entry.total).toLocaleString()} users`
                      }))}
                      value={step}
                      onChange={(next) => updateStep(index, next)}
                      placeholder="Select or type event name…"
                      className="w-full text-xs"
                    />
                  </div>

                  {/* Reorder Up/Down */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => moveStep(index, 'up')}
                      title="Move step up"
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => moveStep(index, 'down')}
                      title="Move step down"
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Remove Step */}
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:border-slate-800 dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    onClick={() => removeStep(index)}
                    disabled={steps.length <= 2}
                    title="Remove step"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {warning && (
                  <p className="mt-2 flex items-start gap-1.5 pl-9 text-[11px] text-amber-600 dark:text-amber-400">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span>{warning}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-200 dark:border-slate-800">
        <div>
          {isEdit && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
              onClick={() => {
                setDeleteError(null);
                setIsDeleteOpen(true);
              }}
              disabled={isDeleting}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Funnel
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 shadow-xs transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {isSubmitting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Saving…</span>
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Create Funnel'
            )}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isEdit && (
        <DashboardDialog
          open={isDeleteOpen}
          title="Delete this funnel?"
          description="This permanently removes the funnel and its configured steps. Captured raw event logs will remain intact."
          onClose={() => {
            if (!isDeleting) setIsDeleteOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-lg bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete Funnel'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-neutral-600 dark:text-slate-400">
              The funnel <span className="font-semibold text-neutral-900 dark:text-white">{funnel?.name}</span> will be permanently removed.
            </p>
            {deleteError && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        </DashboardDialog>
      )}
    </form>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

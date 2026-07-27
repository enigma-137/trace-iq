'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface FunnelFormProps {
  eventNames: string[];
  funnel?: {
    id: string;
    name: string;
    steps: Array<{ eventName: string }>;
  };
}

export function FunnelForm({ eventNames, funnel }: FunnelFormProps) {
  const isEdit = Boolean(funnel);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [name, setName] = useState(funnel?.name ?? '');
  const [steps, setSteps] = useState<string[]>(funnel?.steps.map((s) => s.eventName) ?? ['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function updateStep(index: number, value: string) {
    setSteps((current) => current.map((step, i) => (i === index ? value : step)));
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
      setError('Give the funnel a name.');
      return;
    }
    if (cleanedSteps.length < 2) {
      setError('Add at least two event steps.');
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
      router.push(`/dashboard/funnels/${isEdit ? funnel!.id : result.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save funnel.');
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!funnel) return;
    setIsDeleting(true);
    const token = await getToken();
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsDeleting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/funnels/${funnel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        setError(await readError(response));
        setIsDeleting(false);
        return;
      }
      router.push('/dashboard/funnels');
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete funnel.');
      setIsDeleting(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{isEdit ? 'Edit funnel' : 'New funnel'}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
          Order the events a user must complete. Conversion is measured in sequence.
        </p>
      </div>

      <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
        Funnel name
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Signup to purchase" />
      </label>

      <datalist id="funnel-event-names">
        {eventNames.map((eventName) => (
          <option key={eventName} value={eventName} />
        ))}
      </datalist>

      <div className="grid gap-2">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center font-mono text-xs text-neutral-400 dark:text-slate-500">{index + 1}</span>
            <input
              className={inputClass}
              list="funnel-event-names"
              value={step}
              onChange={(event) => updateStep(index, event.target.value)}
              placeholder="event_name"
            />
            <button
              type="button"
              className="h-9 shrink-0 rounded-md border border-neutral-300 px-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900"
              onClick={() => removeStep(index)}
              disabled={steps.length <= 2}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={addStep}
        >
          Add step
        </button>
        <button
          type="submit"
          className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create funnel'}
        </button>
        {isEdit ? (
          <button
            type="button"
            className="ml-auto h-10 rounded-md border border-red-300 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={() => setIsDeleteOpen(true)}
            disabled={isDeleting}
          >
            Delete funnel
          </button>
        ) : null}
      </div>

      {isEdit ? (
        <DashboardDialog
          open={isDeleteOpen}
          title="Delete this funnel?"
          description="This permanently removes the funnel and its steps. Captured events are not affected."
          onClose={() => {
            if (!isDeleting) setIsDeleteOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete funnel'}
              </button>
            </>
          }
        >
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            The funnel <span className="font-semibold text-neutral-900 dark:text-white">{funnel?.name}</span> will be removed.
          </p>
        </DashboardDialog>
      ) : null}
    </form>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

const inputClass =
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';

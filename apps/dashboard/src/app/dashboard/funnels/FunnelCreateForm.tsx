'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface FunnelCreateFormProps {
  eventNames: string[];
}

export function FunnelCreateForm({ eventNames }: FunnelCreateFormProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<string[]>(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateStep(index: number, value: string) {
    setSteps((current) => current.map((step, i) => (i === index ? value : step)));
  }

  function addStep() {
    setSteps((current) => [...current, '']);
  }

  function removeStep(index: number) {
    setSteps((current) => (current.length <= 2 ? current : current.filter((_, i) => i !== index)));
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
    const {
      data: { session }
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/funnels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: name.trim(), steps: cleanedSteps })
      });

      if (!response.ok) {
        setError(await readError(response));
        setIsSubmitting(false);
        return;
      }

      const funnel = (await response.json()) as { id: string };
      router.push(`/dashboard/funnels/${funnel.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create funnel.');
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">New funnel</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Order the events a user must complete. Conversion is measured in sequence.
        </p>
      </div>

      <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
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
            <span className="w-6 shrink-0 text-center font-mono text-xs text-neutral-400 dark:text-neutral-500">{index + 1}</span>
            <input
              className={inputClass}
              list="funnel-event-names"
              value={step}
              onChange={(event) => updateStep(index, event.target.value)}
              placeholder="event_name"
            />
            <button
              type="button"
              className="h-9 shrink-0 rounded-md border border-neutral-300 px-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
              onClick={() => removeStep(index)}
              disabled={steps.length <= 2}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          onClick={addStep}
        >
          Add step
        </button>
        <button
          type="submit"
          className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating…' : 'Create funnel'}
        </button>
      </div>
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
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-white dark:focus:ring-white/10';

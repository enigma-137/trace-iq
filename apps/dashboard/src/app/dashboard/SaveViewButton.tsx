'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';
import type { DashboardDefinition } from './dashboards/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SaveViewButton({
  definition,
  projectId
}: {
  definition: DashboardDefinition;
  projectId?: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = (definition as { source?: string }).source === 'trend' && Boolean((definition as { event?: string }).event);

  async function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the dashboard a name.');
      return;
    }
    setBusy(true);
    const {
      data: { session }
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError('Your dashboard session expired. Sign in again.');
      setBusy(false);
      return;
    }
    try {
      const query = projectId ? `?projectId=${projectId}` : '';
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/dashboards${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, definition })
      });
      if (!response.ok) {
        setError(await readError(response));
        setBusy(false);
        return;
      }
      setBusy(false);
      setOpen(false);
      setName('');
      router.refresh();
    } catch {
      setError('Could not save the dashboard.');
      setBusy(false);
    }
  }

  if (!canSave) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName('');
          setError(null);
          setOpen(true);
        }}
        className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Save view
      </button>

      <DashboardDialog
        open={open}
        title="Save as dashboard"
        description="The current view (event, time range, measure, filters) is captured as a saved dashboard you can reopen or compare later."
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        footer={
          <>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void handleSave()}>
              {busy ? 'Saving…' : 'Save dashboard'}
            </button>
          </>
        }
      >
        <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
          Name
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Signups last 7 days"
            autoFocus
          />
        </label>
        {error ? (
          <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {error}
          </p>
        ) : null}
      </DashboardDialog>
    </>
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
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-white dark:focus:ring-white/10';
const secondaryBtn =
  'h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const primaryBtn =
  'h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200';
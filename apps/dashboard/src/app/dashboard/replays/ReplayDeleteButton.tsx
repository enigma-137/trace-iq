'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ReplayDeleteButton({
  replayId,
  projectId,
  redirectTo,
}: {
  replayId: string;
  projectId?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteReplay() {
    if (isDeleting) return;

    setError(null);
    setIsDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your dashboard session expired. Sign in again.');

      const query = new URLSearchParams();
      if (projectId) query.set('projectId', projectId);
      const serializedQuery = query.toString();
      const suffix = serializedQuery ? `?${serializedQuery}` : '';
      const response = await fetch(
        `${apiBaseUrl}/v1/dashboard/replays/${encodeURIComponent(replayId)}${suffix}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
          credentials: 'omit',
        },
      );
      if (!response.ok) throw new Error(await readApiError(response, 'Replay could not be deleted.'));

      setIsOpen(false);
      toast.success('The replay and its stored chunks were deleted.', { title: 'Replay deleted' });
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (deleteError) {
      const message = await readApiError(deleteError, 'Replay could not be deleted.');
      setError(message);
      toast.error(message, { title: 'Replay deletion failed' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="inline-grid justify-items-end gap-1">
      <button
        type="button"
        className="font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
        disabled={isDeleting}
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
      >
        Delete
      </button>
      <DashboardDialog
        open={isOpen}
        title="Delete replay?"
        description="This permanently deletes the replay and its stored chunks. It cannot be recovered."
        onClose={() => {
          if (!isDeleting) setIsOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={isDeleting}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => void deleteReplay()}
            >
              {isDeleting ? 'Deleting…' : 'Delete replay'}
            </button>
          </>
        }
      >
        {error ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </DashboardDialog>
    </div>
  );
}

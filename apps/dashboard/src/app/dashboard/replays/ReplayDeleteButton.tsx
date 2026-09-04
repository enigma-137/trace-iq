'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteReplay() {
    if (isDeleting || !window.confirm('Delete this replay permanently? Its stored replay chunks cannot be recovered.')) return;

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
      if (!response.ok) throw new Error(await readError(response));

      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Replay could not be deleted.');
      setIsDeleting(false);
    }
  }

  return (
    <div className="inline-grid justify-items-end gap-1">
      <button
        type="button"
        className="font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
        disabled={isDeleting}
        onClick={() => void deleteReplay()}
      >
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
      {error ? (
        <p className="max-w-56 text-right text-xs leading-4 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) return body.message.join(' ');
    return body.message || body.error || `Replay could not be deleted (${response.status}).`;
  } catch {
    return `Replay could not be deleted (${response.status}).`;
  }
}

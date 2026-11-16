'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { GitHubIcon } from '@/components/ProviderIcons';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { GitHubStatusResponse } from '@/lib/github-integration';
import { GITHUB_INTEGRATION_API } from './settings/integrations/github-install';

const DISMISS_PREFIX = 'traceiq-github-announcement-dismissed:';

/** Whether to announce GitHub: the app is set up here, this person can install it, and the organization hasn't. */
export function shouldAnnounceGitHub(status: Pick<GitHubStatusResponse, 'configured' | 'canManage' | 'installation'>): boolean {
  return status.configured && status.canManage && !status.installation;
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * One-time "New: GitHub" card on the Overview. Shows only to people who can install the
 * TraceIQ GitHub App, while their organization hasn't, and stays gone once dismissed
 * (per organization, in this browser). Renders nothing while loading or on any error.
 */
export function GitHubAnnouncement({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const access = (await supabase.auth.getSession()).data.session?.access_token;
        if (!access) return;
        const response = await fetch(`${GITHUB_INTEGRATION_API}/status?projectId=${encodeURIComponent(projectId)}`, {
          headers: { Authorization: `Bearer ${access}` }
        });
        if (!response.ok) return;
        const status = (await response.json()) as GitHubStatusResponse;
        if (!cancelled && shouldAnnounceGitHub(status) && !readDismissed(DISMISS_PREFIX + status.organizationId)) setOrganizationId(status.organizationId);
      } catch {
        // The card is optional; the Overview works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  if (!organizationId || !projectId) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_PREFIX + organizationId, '1');
    } catch {
      // Hidden for this visit only.
    }
    setOrganizationId(null);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white dark:bg-white dark:text-black">
          <GitHubIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            <span className="mr-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              New
            </span>
            Connect GitHub
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            Jump from an error&apos;s stack trace to the exact line in your repository, see the commit and pull request behind each release,
            and let TraceIQ open a setup pull request for new projects.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
        >
          Not now
        </button>
        <Link
          href={`/dashboard/settings/integrations?projectId=${encodeURIComponent(projectId)}`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
        >
          Connect GitHub
        </Link>
      </div>
    </section>
  );
}

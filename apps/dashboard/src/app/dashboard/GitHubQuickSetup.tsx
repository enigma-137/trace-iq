'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import type { DetectedAppInfo, GitHubStatusResponse, SetupPullRequestInfo } from '@/lib/github-integration';
import { GitHubIcon } from '@/components/ProviderIcons';
import { GITHUB_INTEGRATION_API } from './settings/integrations/github-install';

/**
 * Shortcut for organizations that already installed the TraceIQ GitHub App: paste a
 * repository URL and get the setup pull request in one step, skipping the wizard's
 * other steps. Hidden until the app is installed and the person can manage it.
 */
export function GitHubQuickSetup({ projectId, onWaitForEvent }: { projectId: string; onWaitForEvent: () => void }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [available, setAvailable] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<DetectedAppInfo[] | null>(null);
  const [pullRequest, setPullRequest] = useState<SetupPullRequestInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const access = (await supabase.auth.getSession()).data.session?.access_token;
    return access ? { Authorization: `Bearer ${access}` } : null;
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch(`${GITHUB_INTEGRATION_API}/status?projectId=${encodeURIComponent(projectId)}`, { headers });
        if (!response.ok) return;
        const status = (await response.json()) as GitHubStatusResponse;
        if (!cancelled) setAvailable(status.canManage && status.installation?.status === 'active');
      } catch {
        // No shortcut; the rest of the wizard works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, projectId]);

  async function submit(event?: FormEvent, subdirectory?: string) {
    event?.preventDefault();
    if (!repoUrl.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_INTEGRATION_API}/projects/${encodeURIComponent(projectId)}/setup-pr-from-url`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(subdirectory === undefined ? { repoUrl } : { repoUrl, subdirectory })
      });
      if (!response.ok) {
        const body = (await response.clone().json().catch(() => null)) as { code?: string; candidates?: DetectedAppInfo[] } | null;
        if (body?.code === 'SETUP_PICK_FOLDER' && body.candidates?.length) {
          setCandidates(body.candidates);
          return;
        }
        setMessage(await readApiError(response, 'Could not open the setup pull request.'));
        return;
      }
      const body = (await response.json()) as { created: boolean; pullRequest: SetupPullRequestInfo };
      setCandidates(null);
      setPullRequest(body.pullRequest);
      toast.success(body.created ? `Opened pull request #${body.pullRequest.number}.` : `Pull request #${body.pullRequest.number} is already open.`, {
        title: 'Setup pull request'
      });
    } catch (error) {
      setMessage(await readApiError(error, 'Could not open the setup pull request.'));
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950" aria-label="Set up from a GitHub repository">
      {pullRequest ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <GitHubIcon className="size-4 text-neutral-900 dark:text-white" />
          <span className="text-neutral-700 dark:text-slate-300">Setup pull request ready.</span>
          <a href={pullRequest.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
            Open #{pullRequest.number}
          </a>
          <button
            type="button"
            onClick={onWaitForEvent}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Merge it, then wait for the first event
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="quick-setup-repo" className="flex shrink-0 items-center gap-2 text-sm font-medium text-neutral-800 dark:text-slate-200">
            <GitHubIcon className="size-4" />
            Already on GitHub?
          </label>
          <input
            id="quick-setup-repo"
            className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Paste a repository URL, e.g. https://github.com/acme/web"
            value={repoUrl}
            disabled={busy}
            onChange={(event) => setRepoUrl(event.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !repoUrl.trim()}
            className="h-9 shrink-0 rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            {busy ? 'Opening PR…' : 'Get a setup PR'}
          </button>
        </form>
      )}
      {candidates ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-neutral-700 dark:text-slate-300">This repository has several apps. Which one is this project?</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((candidate) => (
              <button
                key={candidate.folder}
                type="button"
                disabled={busy || !candidate.supported}
                title={candidate.supported ? undefined : `${candidate.label} can’t be set up automatically yet`}
                onClick={() => void submit(undefined, candidate.folder)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              >
                <code>{candidate.folder}</code> · {candidate.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{message} You can still use the steps below.</p> : null}
    </section>
  );
}

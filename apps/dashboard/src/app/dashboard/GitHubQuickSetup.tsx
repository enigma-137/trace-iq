'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import {
  integrationsHref,
  quickSetupBlocker,
  repoVisibility,
  resolveRepoInput,
  type DetectedAppInfo,
  type GitHubRepoOption,
  type GitHubStatusResponse,
  type SetupPullRequestInfo
} from '@/lib/github-integration';
import { GitHubIcon } from '@/components/ProviderIcons';
import { GITHUB_INTEGRATION_API } from './settings/integrations/github-install';
import { RepoAccessHint } from './settings/integrations/RepoAccessHint';
import { RepoNameInput } from './settings/integrations/RepoNameInput';

/**
 * Paste a repository URL and get the setup pull request in one step, skipping the wizard's
 * other steps. Shown whenever GitHub is available on this server: until the app is
 * installed (or for members who can't manage it) the field is disabled and says why, with
 * a link to the GitHub card in Settings → Integrations.
 */
export function GitHubQuickSetup({ projectId, onWaitForEvent }: { projectId: string; onWaitForEvent: () => void }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<GitHubStatusResponse | null>(null);
  const [repos, setRepos] = useState<GitHubRepoOption[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [reposVersion, setReposVersion] = useState(0);
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
        const body = (await response.json()) as GitHubStatusResponse;
        if (!cancelled) setStatus(body);
      } catch {
        // No shortcut; the rest of the wizard works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, projectId]);

  // The repositories the app can see: suggestions, and an early "TraceIQ can't see it".
  const ready = status ? quickSetupBlocker(status) === null : false;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setReposError(null);
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch(`${GITHUB_INTEGRATION_API}/repos?projectId=${encodeURIComponent(projectId)}`, { headers });
        if (cancelled) return;
        if (!response.ok) return setReposError(await readApiError(response, 'Could not load repositories.'));
        const body = (await response.json()) as { repos: GitHubRepoOption[] };
        if (!cancelled) setRepos(body.repos);
      } catch (error) {
        if (!cancelled) setReposError(await readApiError(error, 'Could not load repositories.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authHeaders, projectId, reposVersion]);

  const installation = status?.installation ?? null;
  const resolved = resolveRepoInput(repoUrl, { repos, accountLogin: installation?.accountLogin });
  const notVisible = repoVisibility(resolved, repos) === 'not_visible';

  async function submit(event?: FormEvent, subdirectory?: string) {
    event?.preventDefault();
    if (!repoUrl.trim() || busy || notVisible) return;
    if (!resolved) return setMessage('Enter the repository as owner/name, its name, or its GitHub URL.');
    setBusy(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_INTEGRATION_API}/projects/${encodeURIComponent(projectId)}/setup-pr-from-url`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        // A pasted URL goes as is, so a /tree/<branch>/<folder> link keeps its folder.
        body: JSON.stringify({
          repoUrl: /github\.com|^git@/i.test(repoUrl.trim()) ? repoUrl.trim() : resolved,
          ...(subdirectory === undefined ? {} : { subdirectory })
        })
      });
      if (!response.ok) {
        const body = (await response.clone().json().catch(() => null)) as { code?: string; candidates?: DetectedAppInfo[] } | null;
        if (body?.code === 'SETUP_PICK_FOLDER' && body.candidates?.length) {
          setCandidates(body.candidates);
          return;
        }
        if (body?.code === 'GITHUB_REPO_NOT_VISIBLE') {
          // The list was stale or too long to check up front: refresh it so the hint explains.
          setReposVersion((version) => version + 1);
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

  // Hidden only when GitHub isn't offered on this server at all.
  if (!status || (!status.configured && !installation)) return null;
  const blocker = quickSetupBlocker(status);
  const settingsLink = (
    <Link href={integrationsHref(projectId)} className="font-medium underline underline-offset-2">
      {blocker === 'not_installed' ? 'Connect GitHub in Settings → Integrations' : 'Open GitHub settings'}
    </Link>
  );

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
          <RepoNameInput
            id="quick-setup-repo"
            className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
            value={repoUrl}
            repos={repos}
            disabled={busy || blocker !== null}
            onChange={setRepoUrl}
          />
          <button
            type="submit"
            disabled={busy || blocker !== null || !repoUrl.trim() || notVisible}
            className="h-9 shrink-0 rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
          >
            {busy ? 'Opening PR…' : 'Get a setup PR'}
          </button>
        </form>
      )}

      {!pullRequest && blocker === 'not_installed' ? (
        <p className="mt-2 text-xs text-neutral-600 dark:text-slate-400">
          Install the TraceIQ GitHub App first, so TraceIQ can read the repository and open the pull request. {settingsLink}.
        </p>
      ) : null}
      {!pullRequest && blocker === 'suspended' ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          The TraceIQ GitHub App is suspended on {installation?.accountLogin}. Unsuspend it on GitHub to continue. {settingsLink}.
        </p>
      ) : null}
      {!pullRequest && blocker === 'not_allowed' ? (
        <p className="mt-2 text-xs text-neutral-600 dark:text-slate-400">Only owners and admins can open setup pull requests. Ask one of them, or use the steps below.</p>
      ) : null}
      {!pullRequest && blocker === null && installation && (repoUrl.trim() || repos?.length === 0 || reposError) ? (
        <RepoAccessHint
          installation={installation}
          repos={repos}
          reposError={reposError}
          resolved={resolved}
          onRecheck={() => setReposVersion((version) => version + 1)}
        />
      ) : null}

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

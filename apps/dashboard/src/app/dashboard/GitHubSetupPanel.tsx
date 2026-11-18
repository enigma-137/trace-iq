'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import {
  normalizeSubdirectoryInput,
  repoVisibility,
  resolveRepoInput,
  setupStage,
  type GitHubRepoOption,
  type GitHubStatusResponse,
  type SetupPreview,
  type SetupPullRequestInfo
} from '@/lib/github-integration';
import { GitHubIcon } from '@/components/ProviderIcons';
import { GITHUB_INTEGRATION_API, completeGitHubReturn, startGitHubInstall } from './settings/integrations/github-install';
import { RepoNameInput } from './settings/integrations/RepoNameInput';
import { RepoAccessHint } from './settings/integrations/RepoAccessHint';

type StatusWithPr = GitHubStatusResponse & { setupPullRequest?: SetupPullRequestInfo | null };

const buttonPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200';
const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const input =
  'h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

/**
 * "Connect GitHub → we set it up": install the TraceIQ GitHub App, pick the repository
 * (and folder), review the detected stack and files, and open a setup pull request.
 * Afterwards the wizard's live verification waits for the first event. The manual
 * options below stay available.
 */
export function GitHubSetupPanel({ projectId, onWaitForEvent }: { projectId: string; onWaitForEvent: () => void }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<StatusWithPr | null>(null);
  const [repos, setRepos] = useState<GitHubRepoOption[] | null>(null);
  const [repoFullName, setRepoFullName] = useState('');
  const [folder, setFolder] = useState('');
  const [preview, setPreview] = useState<SetupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pullRequest, setPullRequest] = useState<SetupPullRequestInfo | null>(null);
  const [busy, setBusy] = useState<'install' | 'complete' | 'link' | 'preview' | 'create' | null>(null);
  const [editingRepo, setEditingRepo] = useState(false);
  const handledReturn = useRef(false);
  const query = `?projectId=${encodeURIComponent(projectId)}`;

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const access = (await supabase.auth.getSession()).data.session?.access_token;
    return access ? { Authorization: `Bearer ${access}` } : null;
  }, [supabase]);

  const loadPreview = useCallback(async () => {
    setPreview(null);
    setPreviewError(null);
    setBusy('preview');
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`${GITHUB_INTEGRATION_API}/projects/${encodeURIComponent(projectId)}/setup-preview`, { headers });
      if (!response.ok) return setPreviewError(await readApiError(response, 'Could not read the repository.'));
      const body = (await response.json()) as SetupPreview;
      setPreview(body);
      if (body.status === 'pull_request_open') setPullRequest(body.pullRequest);
    } catch (error) {
      setPreviewError(await readApiError(error, 'Could not read the repository.'));
    } finally {
      setBusy(null);
    }
  }, [authHeaders, projectId]);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`${GITHUB_INTEGRATION_API}/status${query}`, { headers });
      if (!response.ok) return setStatus(null);
      const body = (await response.json()) as StatusWithPr;
      setStatus(body);
      setRepoFullName(body.projectRepo?.repoFullName ?? '');
      setFolder(body.projectRepo?.appSubdirectory ?? '');
      if (body.setupPullRequest) setPullRequest(body.setupPullRequest);
      if (body.installation?.status === 'active') {
        const reposResponse = await fetch(`${GITHUB_INTEGRATION_API}/repos${query}`, { headers });
        if (reposResponse.ok) setRepos(((await reposResponse.json()) as { repos: GitHubRepoOption[] }).repos);
        if (body.projectRepo && !body.setupPullRequest) await loadPreview();
      }
    } catch {
      setStatus(null);
    }
  }, [authHeaders, query, loadPreview]);

  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    void (async () => {
      if (new URLSearchParams(window.location.search).has('github')) {
        setBusy('complete');
        await completeGitHubReturn(authHeaders);
        setBusy(null);
      }
      await load();
    })();
  }, [authHeaders, load]);

  async function install() {
    setBusy('install');
    const leaving = await startGitHubInstall(authHeaders, { projectId, returnTo: 'setup' });
    if (!leaving) setBusy(null);
  }

  async function linkRepo(nextFolder = folder) {
    const resolved = resolveRepoInput(repoFullName, { repos, accountLogin: status?.installation?.accountLogin });
    if (!resolved) return toast.error('Enter the repository as owner/name, its name, or its GitHub URL.');
    const subdirectory = normalizeSubdirectoryInput(nextFolder);
    if (subdirectory === null) return toast.error('The app folder must be a folder inside the repository, like apps/web.');
    setBusy('link');
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`${GITHUB_INTEGRATION_API}/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: resolved, subdirectory })
      });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not use that repository.'));
      setRepoFullName(resolved);
      setFolder(subdirectory);
      setEditingRepo(false);
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not use that repository.'));
    } finally {
      setBusy((current) => (current === 'link' ? null : current));
    }
  }

  async function createPullRequest() {
    setBusy('create');
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`${GITHUB_INTEGRATION_API}/projects/${encodeURIComponent(projectId)}/setup-pr`, { method: 'POST', headers });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not open the setup pull request.'), { title: 'No pull request opened' });
      const body = (await response.json()) as { created: boolean; pullRequest: SetupPullRequestInfo };
      setPullRequest(body.pullRequest);
      toast.success(body.created ? `Opened pull request #${body.pullRequest.number}.` : `Pull request #${body.pullRequest.number} is already open.`, {
        title: 'Setup pull request'
      });
    } catch (error) {
      toast.error(await readApiError(error, 'Could not open the setup pull request.'));
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;
  const installation = status.installation;
  const stage = setupStage({
    configured: status.configured,
    installed: Boolean(installation),
    suspended: installation?.status === 'suspended',
    repoLinked: Boolean(status.projectRepo) && !editingRepo,
    pullRequest: Boolean(pullRequest)
  });
  if (stage === 'hidden') return null;
  const canManage = status.canManage;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950" aria-labelledby="github-setup-title">
      <div className="flex items-start gap-3">
        <GitHubIcon className="mt-0.5 size-5 shrink-0 text-neutral-900 dark:text-white" />
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Connect GitHub · we set it up
          </span>
          <h4 id="github-setup-title" className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">
            Get a pull request that installs TraceIQ
          </h4>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-slate-400">
            TraceIQ reads your repository, detects the stack and opens a pull request on a <code>traceiq/setup</code> branch for you to review and merge.
            It never pushes to your default branch, and your write key is never committed.
          </p>

          {!canManage ? (
            <p className="mt-3 text-sm text-neutral-600 dark:text-slate-400">Ask an owner or admin of this organization to connect GitHub.</p>
          ) : stage === 'install' ? (
            <div className="mt-4">
              <button type="button" className={buttonPrimary} disabled={busy !== null} onClick={() => void install()}>
                {busy === 'install' ? 'Opening GitHub…' : busy === 'complete' ? 'Connecting…' : 'Connect GitHub'}
              </button>
              <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">You choose which repositories the TraceIQ app can see.</p>
            </div>
          ) : stage === 'suspended' ? (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              The TraceIQ GitHub App is suspended on {installation?.accountLogin}. Unsuspend it on GitHub to continue.
            </p>
          ) : stage === 'pick_repo' ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-300" htmlFor="github-repo-wizard">
                Repository
                <RepoNameInput id="github-repo-wizard" className={input} value={repoFullName} repos={repos} disabled={busy !== null} onChange={setRepoFullName} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-300">
                App folder <span className="font-normal text-neutral-400">(monorepos, optional)</span>
                <input className={input} placeholder="apps/web" value={folder} disabled={busy !== null} onChange={(event) => setFolder(event.target.value)} />
              </label>
              <button
                type="button"
                className={buttonPrimary}
                disabled={
                  busy !== null ||
                  !repoFullName.trim() ||
                  repoVisibility(resolveRepoInput(repoFullName, { repos, accountLogin: installation?.accountLogin }), repos) === 'not_visible'
                }
                onClick={() => void linkRepo()}
              >
                {busy === 'link' ? 'Saving…' : 'Use this repository'}
              </button>
              {installation ? (
                <div className="sm:col-span-3">
                  <RepoAccessHint
                    installation={installation}
                    repos={repos}
                    reposError={null}
                    resolved={resolveRepoInput(repoFullName, { repos, accountLogin: installation.accountLogin })}
                    onRecheck={() => void load()}
                  />
                </div>
              ) : null}
            </div>
          ) : stage === 'pull_request' && pullRequest ? (
            <div className="mt-4 space-y-3">
              <a href={pullRequest.url} target="_blank" rel="noopener noreferrer" className={buttonPrimary}>
                Open pull request #{pullRequest.number}
              </a>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-slate-300">
                <li>Run your package manager’s install on the branch and commit the lockfile (the PR says which command).</li>
                <li>Add the TraceIQ environment variables, including your write key from step 1, to your host and CI secrets.</li>
                <li>Merge and deploy, or run the branch locally. We’ll show Connected as soon as the first event arrives.</li>
              </ol>
              <button type="button" className={buttonSecondary} onClick={onWaitForEvent}>
                Wait for the first event
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-neutral-700 dark:text-slate-300">
                Repository <span className="font-medium">{status.projectRepo?.repoFullName}</span>
                {status.projectRepo?.appSubdirectory ? <> · folder <code>{status.projectRepo.appSubdirectory}</code></> : null}{' '}
                <button type="button" className="text-xs underline underline-offset-2" onClick={() => setEditingRepo(true)}>
                  change
                </button>
              </p>

              {busy === 'preview' ? <p className="text-sm text-neutral-500">Reading the repository…</p> : null}
              {previewError ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {previewError}{' '}
                  <button type="button" className="underline" onClick={() => void loadPreview()}>
                    Try again
                  </button>
                </p>
              ) : null}

              {preview?.status === 'ready' ? (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-700 dark:text-slate-300">
                    Detected <span className="font-semibold">{preview.app.label}</span>
                    {preview.app.folder ? <> in <code>{preview.app.folder}</code></> : null} · {preview.app.packageManager ?? 'npm'}
                  </p>
                  <ul className="space-y-0.5 text-xs text-neutral-600 dark:text-slate-400">
                    {preview.plan.files.map((file) => (
                      <li key={file.path}>
                        <code>{file.path}</code> · {file.action === 'create' ? 'new' : 'updated'}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Environment variables to set where the app runs: {preview.plan.envVars.map((item) => item.name).join(', ')}.
                  </p>
                  {preview.plan.manualSteps.length ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">The pull request lists {preview.plan.manualSteps.length} step(s) to finish by hand.</p>
                  ) : null}
                  <button type="button" className={buttonPrimary} disabled={busy !== null} onClick={() => void createPullRequest()}>
                    {busy === 'create' ? 'Opening pull request…' : 'Create setup PR'}
                  </button>
                </div>
              ) : null}

              {preview?.status === 'pick_folder' ? (
                <div className="space-y-2">
                  <p className="text-sm text-neutral-700 dark:text-slate-300">This repository has several apps. Which one is this project?</p>
                  <div className="flex flex-wrap gap-2">
                    {preview.candidates.map((candidate) => (
                      <button
                        key={candidate.folder}
                        type="button"
                        className={buttonSecondary}
                        disabled={busy !== null || !candidate.supported}
                        title={candidate.supported ? undefined : `${candidate.label} can’t be set up automatically yet`}
                        onClick={() => void linkRepo(candidate.folder)}
                      >
                        <code>{candidate.folder}</code> · {candidate.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {preview && ['unsupported', 'already_installed', 'file_exists', 'invalid_output'].includes(preview.status) && 'message' in preview ? (
                <p className="text-sm text-neutral-700 dark:text-slate-300">
                  {preview.message} The options below still work.
                </p>
              ) : null}
            </div>
          )}

          <p className="mt-4 text-xs text-neutral-500 dark:text-slate-400">
            Manage the connection in <Link className="underline" href={`/dashboard/settings/integrations?projectId=${encodeURIComponent(projectId)}`}>Settings → Integrations</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readActiveProjectIdFromDocument } from '@/lib/active-project';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import Link from 'next/link';
import { normalizeSubdirectoryInput, resolveRepoInput, setupWizardHref, type GitHubRepoOption, type GitHubStatusResponse } from '@/lib/github-integration';
import { RepoNameInput } from './RepoNameInput';
import { GITHUB_INTEGRATION_API, completeGitHubReturn, startGitHubInstall } from './github-install';
import { GitHubIcon } from '@/components/ProviderIcons';
import { Skeleton } from '@/components/Skeleton';
import { DashboardDialog } from '../../DashboardDialog';
import {
  Notice,
  SettingsCard,
  SettingsRow,
  StatusPill,
  dangerButton,
  fieldLabelClass,
  inputClass,
  primaryButton,
  secondaryButton
} from '../SettingsUI';

const GITHUB_API = GITHUB_INTEGRATION_API;

type Busy = 'install' | 'complete' | 'disconnect' | 'save' | 'unlink' | null;

/** The TraceIQ GitHub App: install it, then pick the repository (and folder) for this project. */
export function GitHubIntegrationCard({ projectId: projectIdProp }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [projectId] = useState(() => projectIdProp ?? readActiveProjectIdFromDocument() ?? undefined);
  const [status, setStatus] = useState<GitHubStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [repos, setRepos] = useState<GitHubRepoOption[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoFullName, setRepoFullName] = useState('');
  const [subdirectory, setSubdirectory] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const handledReturn = useRef(false);

  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const access = (await supabase.auth.getSession()).data.session?.access_token;
    return access ? { Authorization: `Bearer ${access}` } : null;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const headers = await authHeaders();
      if (!headers) return setLoadError('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_API}/status${query}`, { headers });
      if (!response.ok) return setLoadError(await readApiError(response, 'Could not load the GitHub connection.'));
      const body = (await response.json()) as GitHubStatusResponse;
      setStatus(body);
      setRepoFullName(body.projectRepo?.repoFullName ?? '');
      setSubdirectory(body.projectRepo?.appSubdirectory ?? '');
    } catch (error) {
      setLoadError(await readApiError(error, 'Could not load the GitHub connection.'));
    }
  }, [authHeaders, query]);

  // Coming back from GitHub: finish the installation with this session, then load.
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    void (async () => {
      // Coming back from GitHub: finish with this session (shared with the Setup Wizard).
      if (new URLSearchParams(window.location.search).has('github')) {
        setBusy('complete');
        await completeGitHubReturn(authHeaders);
        setBusy(null);
      }
      await load();
    })();
  }, [authHeaders, load]);

  // Repositories the installation can see, once connected.
  const installationStatus = status?.installation?.status;
  useEffect(() => {
    setRepos(null);
    setReposError(null);
    if (installationStatus !== 'active') return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch(`${GITHUB_API}/repos${query}`, { headers });
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
  }, [installationStatus, authHeaders, query]);

  async function install() {
    setBusy('install');
    // On success the browser is on its way to GitHub; keep the button busy until it leaves.
    const leaving = await startGitHubInstall(authHeaders, { projectId, returnTo: 'settings' });
    if (!leaving) setBusy(null);
  }

  async function saveRepo() {
    if (!status?.project || !repoFullName.trim()) return;
    const resolved = resolveRepoInput(repoFullName, { repos, accountLogin: status.installation?.accountLogin });
    if (!resolved) return toast.error('Enter the repository as owner/name, its name, or its GitHub URL.');
    const folder = normalizeSubdirectoryInput(subdirectory);
    if (folder === null) return toast.error('The app folder must be a folder inside the repository, like apps/web.');
    setBusy('save');
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_API}/projects/${encodeURIComponent(status.project.id)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: resolved, subdirectory: folder })
      });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not link the repository.'));
      toast.success(`${resolved}${folder ? ` (${folder})` : ''} is linked to ${status.project.name}. Next: get a setup pull request.`, { title: 'Repository linked' });
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not link the repository.'));
    } finally {
      setBusy(null);
    }
  }

  /** Unlinks this project only; the app stays installed for the organization's other projects. */
  async function unlinkRepo() {
    const project = status?.project;
    const linked = status?.projectRepo?.repoFullName;
    if (!project || !linked) return;
    setBusy('unlink');
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_API}/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE', headers });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not unlink the repository.'));
      toast.success(`${project.name} no longer uses ${linked}. Its open pull requests on GitHub are not changed.`, { title: 'Repository unlinked' });
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not unlink the repository.'));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const headers = await authHeaders();
      if (!headers) return toast.error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${GITHUB_API}${query}`, { method: 'DELETE', headers });
      if (!response.ok) return toast.error(await readApiError(response, 'Could not disconnect GitHub.'));
      const body = (await response.json()) as { uninstalled?: boolean };
      toast.success(
        body.uninstalled
          ? 'The TraceIQ GitHub App was uninstalled and can no longer see your repositories.'
          : 'Disconnected. Uninstall TraceIQ in your GitHub settings to remove its access there too.',
        { title: 'GitHub disconnected' }
      );
      setConfirmingDisconnect(false);
      await load();
    } catch (error) {
      toast.error(await readApiError(error, 'Could not disconnect GitHub.'));
    } finally {
      setBusy(null);
    }
  }

  const installation = status?.installation ?? null;
  const canManage = status?.canManage ?? false;
  const resolvedInput = resolveRepoInput(repoFullName, { repos, accountLogin: installation?.accountLogin }) ?? repoFullName.trim();
  const dirty =
    resolvedInput !== (status?.projectRepo?.repoFullName ?? '') ||
    (normalizeSubdirectoryInput(subdirectory) ?? subdirectory) !== (status?.projectRepo?.appSubdirectory ?? '');

  const headerActions = !status || !status.configured || !canManage ? null : installation ? (
    <button type="button" className={dangerButton} disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}>
      Disconnect
    </button>
  ) : (
    <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void install()}>
      {busy === 'install' ? 'Opening GitHub…' : busy === 'complete' ? 'Connecting…' : 'Install GitHub App'}
    </button>
  );

  return (
    <SettingsCard
      iconNode={<GitHubIcon className="size-[18px] text-neutral-900 dark:text-white" />}
      title="GitHub"
      description="Install the TraceIQ GitHub App on the repositories you choose. TraceIQ only ever proposes changes as pull requests for you to review; it never pushes to your default branch."
      actions={headerActions}
    >
      {loadError ? (
        <div className="px-5 py-4">
          <Notice tone="error">{loadError}</Notice>
        </div>
      ) : !status ? (
        <div className="grid gap-3 px-5 py-4" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : !status.configured && !installation ? (
        <div className="px-5 py-4">
          <Notice tone="info">
            The GitHub App is not set up on this TraceIQ server. An administrator needs to create it and set the <code>GITHUB_APP_*</code> variables
            (see docs/integrations-github.md).
          </Notice>
        </div>
      ) : (
        <>
          <SettingsRow
            label="Status"
            hint={
              !installation
                ? canManage
                  ? 'Separate from signing in with GitHub. You choose which repositories it can see.'
                  : 'Ask an owner or admin to install the GitHub App.'
                : installation.status === 'suspended'
                  ? 'The app is suspended on GitHub. Unsuspend it there to continue.'
                  : undefined
            }
          >
            <span className="inline-flex flex-wrap items-center gap-2">
              {installation ? (
                <>
                  <StatusPill tone={installation.status === 'active' ? 'success' : 'warning'}>
                    {installation.status === 'active' ? 'Installed' : 'Suspended'}
                  </StatusPill>
                  <span>{installation.accountLogin}</span>
                  <a className="text-xs underline underline-offset-2" href={installation.manageUrl} target="_blank" rel="noopener noreferrer">
                    {installation.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories'} · manage on GitHub
                  </a>
                </>
              ) : (
                <StatusPill tone="neutral">Not installed</StatusPill>
              )}
            </span>
          </SettingsRow>

          {installation?.status === 'active' ? (
            status.project ? (
              <SettingsRow
                label={`Repository for ${status.project.name}`}
                hint="Used to open setup pull requests and link errors to code."
                actions={
                  canManage ? (
                    <span className="inline-flex flex-wrap gap-2">
                      {status.projectRepo ? (
                        <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void unlinkRepo()}>
                          {busy === 'unlink' ? 'Unlinking…' : 'Unlink'}
                        </button>
                      ) : null}
                      <button type="button" className={secondaryButton} disabled={busy !== null || !repoFullName.trim() || !dirty} onClick={() => void saveRepo()}>
                        {busy === 'save' ? 'Saving…' : 'Save'}
                      </button>
                    </span>
                  ) : null
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={fieldLabelClass} htmlFor="github-repo-settings">
                    Repository
                    <RepoNameInput
                      id="github-repo-settings"
                      className={inputClass}
                      value={repoFullName}
                      repos={repos}
                      disabled={!canManage || busy !== null}
                      onChange={setRepoFullName}
                    />
                  </label>
                  <label className={fieldLabelClass}>
                    App folder <span className="font-normal text-neutral-400">(monorepos)</span>
                    <input
                      className={inputClass}
                      placeholder="apps/web, or leave empty for the root"
                      value={subdirectory}
                      disabled={!canManage || busy !== null}
                      onChange={(event) => setSubdirectory(event.target.value)}
                    />
                  </label>
                </div>
                {reposError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{reposError}</p> : null}
                {repos?.length === 0 ? (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
                    The app cannot see any repositories yet. Add some under “manage on GitHub”.
                  </p>
                ) : null}
              </SettingsRow>
            ) : (
              <SettingsRow label="Repository">
                <span className="text-neutral-500 dark:text-slate-400">Create a project to link its repository.</span>
              </SettingsRow>
            )
          ) : null}

          {installation?.status === 'active' && status.project && status.projectRepo ? (
            <SettingsRow
              label="Next step"
              hint={`No new project needed: ${status.projectRepo.repoFullName} is linked to ${status.project.name}, so its events and errors arrive there.`}
              actions={
                status.setupPullRequest ? (
                  <a className={secondaryButton} href={status.setupPullRequest.url} target="_blank" rel="noopener noreferrer">
                    Open PR #{status.setupPullRequest.number}
                  </a>
                ) : (
                  <Link className={primaryButton} href={setupWizardHref(status.project.id)}>
                    Get a setup PR
                  </Link>
                )
              }
            >
              {status.setupPullRequest ? (
                <span>
                  The setup pull request is open. Merge it, add the environment variables it lists, and{' '}
                  <Link className="underline underline-offset-2" href={setupWizardHref(status.project.id)}>
                    watch for the first event
                  </Link>{' '}
                  in the Setup Wizard.
                </span>
              ) : (
                <span>TraceIQ reads the repository, detects your stack, and opens a pull request that installs the SDK. You review and merge it.</span>
              )}
            </SettingsRow>
          ) : null}
        </>
      )}

      <DashboardDialog
        open={confirmingDisconnect}
        title="Disconnect GitHub?"
        description="This uninstalls the TraceIQ GitHub App from your GitHub account and unlinks every project’s repository. Open pull requests are not changed."
        maxWidthClass="max-w-sm"
        onClose={() => (busy ? undefined : setConfirmingDisconnect(false))}
        footer={
          <>
            <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => setConfirmingDisconnect(false)} autoFocus>
              Cancel
            </button>
            <button type="button" className={dangerButton} disabled={busy !== null} onClick={() => void disconnect()}>
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        }
      />
    </SettingsCard>
  );
}

'use client';

import { repoVisibility, visibleReposSummary, type GitHubInstallationInfo, type GitHubRepoOption } from '@/lib/github-integration';

/**
 * Under a repository field: which repositories the TraceIQ app can see, or, when the typed
 * one is not among them, how to fix that on GitHub ("Selected repositories" means only the
 * ones picked during install).
 */
export function RepoAccessHint({
  installation,
  repos,
  reposError,
  resolved,
  onRecheck
}: {
  installation: Pick<GitHubInstallationInfo, 'accountLogin' | 'repositorySelection' | 'manageUrl'>;
  repos: GitHubRepoOption[] | null;
  reposError: string | null;
  /** The typed repository as owner/name, or null. */
  resolved: string | null;
  onRecheck?: () => void;
}) {
  if (reposError) return <p className="mt-2 text-xs text-red-600 dark:text-red-400">{reposError}</p>;
  if (repos === null) return <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">Loading the repositories TraceIQ can see…</p>;

  const manage = (
    <a className="font-medium underline underline-offset-2" href={installation.manageUrl} target="_blank" rel="noopener noreferrer">
      {repos.length ? 'Add it on GitHub' : 'Choose repositories on GitHub'}
    </a>
  );
  const recheck = onRecheck ? (
    <button type="button" className="font-medium underline underline-offset-2" onClick={onRecheck}>
      Check again
    </button>
  ) : null;

  if (repoVisibility(resolved, repos) === 'not_visible') {
    return (
      <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300" role="status">
        TraceIQ can’t see <span className="font-semibold">{resolved}</span>. The app is installed on {installation.accountLogin} with access to
        {installation.repositorySelection === 'all' ? ' that account’s repositories only' : ' only the repositories you picked'}. {manage}
        {recheck ? <>, then {recheck}.</> : '.'}
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-slate-400">
      {visibleReposSummary(repos, installation.repositorySelection, installation.accountLogin)}{' '}
      {installation.repositorySelection === 'selected' || !repos.length ? (
        <>
          Missing one? {manage}
          {recheck ? <>, then {recheck}.</> : '.'}
        </>
      ) : null}
    </p>
  );
}

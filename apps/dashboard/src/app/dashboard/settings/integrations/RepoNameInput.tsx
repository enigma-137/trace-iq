'use client';

import type { GitHubRepoOption } from '@/lib/github-integration';

/**
 * Repository field that works for any number of repositories: type `owner/name`, just the
 * name, or paste a GitHub URL. Repositories the app can see are suggested as you type;
 * the list is optional, so a slow or very long list never blocks typing.
 */
export function RepoNameInput({
  id,
  value,
  onChange,
  repos,
  disabled,
  className
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  repos: GitHubRepoOption[] | null;
  disabled?: boolean;
  className: string;
}) {
  const listId = `${id}-suggestions`;
  return (
    <>
      <input
        id={id}
        className={className}
        value={value}
        disabled={disabled}
        list={listId}
        autoComplete="off"
        spellCheck={false}
        placeholder="owner/repo, a name, or a GitHub URL"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {(repos ?? []).map((repo) => (
          <option key={repo.id} value={repo.fullName}>
            {repo.private ? 'private' : 'public'}
          </option>
        ))}
      </datalist>
    </>
  );
}

import { isRepoFullName } from './github-app.client';

export interface ParsedRepoUrl {
  fullName: string;
  /** Whatever followed `/tree/` (branch and folder), when the link pointed inside the repo. */
  treePath: string | null;
}

/**
 * Reads a GitHub repository from what people paste: `https://github.com/o/r`,
 * `github.com/o/r.git`, `git@github.com:o/r.git`, `o/r`, or a folder link such as
 * `https://github.com/o/r/tree/main/apps/web`. Only github.com; null for anything else.
 */
export function parseRepoUrl(input: unknown): ParsedRepoUrl | null {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value || value.length > 500) return null;

  const ssh = /^(?:ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(value);
  if (ssh) return finish(`${ssh[1]}/${ssh[2]}`, null);

  if (/^[\w.-]+\/[\w.-]+$/.test(value) && !value.includes('.com')) return finish(value.replace(/\.git$/, ''), null);

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.length < 2) return null;
  const [owner, rawName, kind, ...rest] = segments;
  const treePath = kind === 'tree' && rest.length ? rest.join('/') : null;
  return finish(`${owner}/${rawName.replace(/\.git$/, '')}`, treePath);
}

function finish(fullName: string, treePath: string | null): ParsedRepoUrl | null {
  return isRepoFullName(fullName) ? { fullName, treePath } : null;
}

/** The folder in a `/tree/<branch>/<folder>` link, when the branch is the default branch. */
export function subdirectoryFromTreePath(treePath: string | null, defaultBranch: string): string {
  if (!treePath) return '';
  if (treePath === defaultBranch) return '';
  return treePath.startsWith(`${defaultBranch}/`) ? treePath.slice(defaultBranch.length + 1) : '';
}

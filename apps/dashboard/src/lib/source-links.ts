/**
 * Links from error stack frames to the code on GitHub. Pure: takes the stack text and
 * the project's source context (linked repository + the release's commit) and returns
 * one link per in-app frame it can place in the repository. A frame it cannot place
 * confidently (bundled URLs, dependencies, runtime internals) gets no link rather than a
 * wrong one.
 */

export type SourceContext =
  | { linked: false }
  | {
      linked: true;
      repo: { fullName: string; htmlUrl: string; defaultBranch: string; appSubdirectory: string };
      ref:
        | {
            exact: true;
            sha: string;
            commitUrl: string;
            source: 'commit' | 'tag';
            pullRequests: Array<{ number: number; url: string; title: string; state: string; merged: boolean }>;
          }
        | { exact: false; branch: string };
    };

export interface StackFrame {
  fn: string | null;
  file: string;
  line: number;
  column: number;
}

export interface SourceLink {
  fn: string | null;
  /** Path in the repository. */
  path: string;
  line: number;
  url: string;
}

const V8_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*([^@\s]*)@(.+?):(\d+):(\d+)\s*$/;
export const MAX_SOURCE_LINKS = 5;

export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const text of stack.split(/\r?\n/)) {
    const match = V8_FRAME.exec(text) ?? GECKO_FRAME.exec(text);
    if (!match) continue;
    frames.push({ fn: match[1] || null, file: match[2], line: Number(match[3]), column: Number(match[4]) });
  }
  return frames;
}

/**
 * Where a frame's file lives in the repository, or null when it can't be placed:
 * - source-mapped paths (`src/App.tsx`, `webpack://app/./src/App.tsx`) are relative to
 *   the app, so the app folder is added;
 * - absolute server paths are placed only from a recognisable anchor (the repository
 *   name or the app folder), never guessed;
 * - URLs to bundles, node_modules, `node:` internals and webpack runtime are skipped.
 */
export function toRepoPath(file: string, repo: { fullName: string; appSubdirectory: string }): string | null {
  let path = file.trim();
  if (!path || /^(node:|native|<anonymous>|\[native code\])/.test(path) || path.includes('(webpack)')) return null;
  if (/^https?:\/\//i.test(path)) return null;
  path = path.replace(/^webpack:\/\/[^/]*\//, '').replace(/^file:\/\//, '').replace(/[?#].*$/, '');
  if (/(^|\/)node_modules\//.test(path) || /^webpack\//.test(path)) return null;

  const folder = repo.appSubdirectory.replace(/^\/+|\/+$/g, '');
  const repoName = repo.fullName.split('/')[1];

  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) {
    const normalized = path.replace(/\\/g, '/');
    const byRepo = normalized.lastIndexOf(`/${repoName}/`);
    if (byRepo !== -1) return clean(normalized.slice(byRepo + repoName.length + 2));
    if (folder) {
      const byFolder = normalized.indexOf(`/${folder}/`);
      if (byFolder !== -1) return clean(normalized.slice(byFolder + 1));
    }
    return null;
  }

  const relative = clean(path.replace(/^(\.\.?\/)+/, ''));
  if (!relative) return null;
  return folder && !relative.startsWith(`${folder}/`) ? `${folder}/${relative}` : relative;
}

function clean(path: string): string {
  return path.split('/').filter((part) => part && part !== '.').join('/');
}

export function buildSourceLinks(stack: string | null | undefined, context: SourceContext | null, max = MAX_SOURCE_LINKS): SourceLink[] {
  if (!stack || !context?.linked) return [];
  const ref = context.ref.exact ? context.ref.sha : context.ref.branch;
  const links: SourceLink[] = [];
  const seen = new Set<string>();
  for (const frame of parseStackFrames(stack)) {
    const path = toRepoPath(frame.file, context.repo);
    if (!path || !Number.isInteger(frame.line) || frame.line < 1) continue;
    const key = `${path}:${frame.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    links.push({ fn: frame.fn, path, line: frame.line, url: `${context.repo.htmlUrl}/blob/${encodeURIComponent(ref)}/${encoded}#L${frame.line}` });
    if (links.length >= max) break;
  }
  return links;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

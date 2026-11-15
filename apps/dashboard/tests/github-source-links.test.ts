import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSourceLinks, parseStackFrames, shortSha, toRepoPath, type SourceContext } from '../src/lib/source-links';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = { fullName: 'acme/web', appSubdirectory: '' };

const exact: SourceContext = {
  linked: true,
  repo: { fullName: 'acme/web', htmlUrl: 'https://github.com/acme/web', defaultBranch: 'main', appSubdirectory: 'apps/web' },
  ref: { exact: true, sha: 'a1b2c3d4e5f6', commitUrl: 'https://github.com/acme/web/commit/a1b2c3d4e5f6', source: 'commit', pullRequests: [] }
};

describe('stack frames', () => {
  it('parses V8 and Firefox/Safari frames', () => {
    expect(parseStackFrames('TypeError: x\n    at Checkout (src/Checkout.tsx:42:7)\n    at src/index.ts:3:1\nrender@src/App.tsx:10:2')).toEqual([
      { fn: 'Checkout', file: 'src/Checkout.tsx', line: 42, column: 7 },
      { fn: null, file: 'src/index.ts', line: 3, column: 1 },
      { fn: 'render', file: 'src/App.tsx', line: 10, column: 2 }
    ]);
  });
});

describe('repository paths', () => {
  it('places source-mapped paths under the app folder', () => {
    expect(toRepoPath('src/Checkout.tsx', repo)).toBe('src/Checkout.tsx');
    expect(toRepoPath('./src/Checkout.tsx', { ...repo, appSubdirectory: 'apps/web' })).toBe('apps/web/src/Checkout.tsx');
    expect(toRepoPath('apps/web/src/x.ts', { ...repo, appSubdirectory: 'apps/web' })).toBe('apps/web/src/x.ts');
    expect(toRepoPath('webpack://_N_E/./src/app/page.tsx', repo)).toBe('src/app/page.tsx');
    expect(toRepoPath('../../src/lib/a.ts', repo)).toBe('src/lib/a.ts');
  });

  it('places absolute server paths only from the repository name or app folder', () => {
    expect(toRepoPath('/home/runner/work/web/web/apps/api/src/server.ts', { fullName: 'acme/web', appSubdirectory: 'apps/api' })).toBe('apps/api/src/server.ts');
    expect(toRepoPath('/srv/build/apps/api/src/server.ts', { fullName: 'acme/web', appSubdirectory: 'apps/api' })).toBe('apps/api/src/server.ts');
    expect(toRepoPath('file:///Users/me/code/web/src/index.js', repo)).toBe('src/index.js');
    // No anchor: no link rather than a guess.
    expect(toRepoPath('/app/dist/server.js', repo)).toBeNull();
  });

  it('skips bundles, dependencies and runtime frames', () => {
    expect(toRepoPath('https://app.acme.com/_next/static/chunks/main-abc.js', repo)).toBeNull();
    expect(toRepoPath('src/node_modules/react-dom/index.js', repo)).toBeNull();
    expect(toRepoPath('node_modules/react/index.js', repo)).toBeNull();
    expect(toRepoPath('node:internal/process/task_queues', repo)).toBeNull();
    expect(toRepoPath('webpack/runtime/jsonp', repo)).toBeNull();
    expect(toRepoPath('<anonymous>', repo)).toBeNull();
  });
});

describe('source links', () => {
  const stack = [
    'TypeError: Cannot read properties of undefined',
    '    at Checkout (src/Checkout.tsx:42:7)',
    '    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:100:1)',
    '    at Checkout (src/Checkout.tsx:42:7)',
    '    at https://app.acme.com/_next/static/chunks/main.js:1:2',
    '    at App (src/App.tsx:9:3)'
  ].join('\n');

  it('links in-app frames at the release commit and line', () => {
    expect(buildSourceLinks(stack, exact)).toEqual([
      { fn: 'Checkout', path: 'apps/web/src/Checkout.tsx', line: 42, url: 'https://github.com/acme/web/blob/a1b2c3d4e5f6/apps/web/src/Checkout.tsx#L42' },
      { fn: 'App', path: 'apps/web/src/App.tsx', line: 9, url: 'https://github.com/acme/web/blob/a1b2c3d4e5f6/apps/web/src/App.tsx#L9' }
    ]);
  });

  it('falls back to the default branch when the release is not a commit', () => {
    const branch: SourceContext = { ...exact, ref: { exact: false, branch: 'main' } } as SourceContext;
    expect(buildSourceLinks('at f (src/a.ts:1:1)', branch)[0].url).toBe('https://github.com/acme/web/blob/main/apps/web/src/a.ts#L1');
  });

  it('gives nothing without a linked repository or a stack, and caps the list', () => {
    expect(buildSourceLinks(stack, { linked: false })).toEqual([]);
    expect(buildSourceLinks(stack, null)).toEqual([]);
    expect(buildSourceLinks(null, exact)).toEqual([]);
    const long = Array.from({ length: 20 }, (_, i) => `    at f${i} (src/f${i}.ts:${i + 1}:1)`).join('\n');
    expect(buildSourceLinks(long, exact)).toHaveLength(5);
    expect(shortSha('a1b2c3d4e5f6')).toBe('a1b2c3d');
  });
});

describe('error page and wizard', () => {
  it('loads the source context when the stack tab opens and shows commit, PRs and frame links', () => {
    const view = read('app/dashboard/errors/ErrorTrackingClientView.tsx');
    expect(view).toContain("if (activeTab !== 'stack' || !sourceKey");
    expect(view).toContain('/source-context${query}');
    expect(view).toContain('buildSourceLinks(latestSymbolicated?.stack ?? latestSample?.stack, activeSource)');
    expect(view).toContain('PR #{pull.number}');
    expect(view).toContain('lines may have moved');
  });

  it('offers paste-a-URL setup above the wizard steps and skips to verification', () => {
    const quick = read('app/dashboard/GitHubQuickSetup.tsx');
    const wizard = read('app/dashboard/SetupWizard.tsx');
    expect(quick).toContain('/setup-pr-from-url`');
    expect(quick).toContain("body?.code === 'SETUP_PICK_FOLDER'");
    expect(quick).toContain("status.canManage && status.installation?.status === 'active'");
    expect(wizard).toContain('{currentStep < 4 ? <GitHubQuickSetup projectId={projectId} onWaitForEvent={() => setCurrentStep(4)} /> : null}');
    expect(wizard.indexOf('<GitHubQuickSetup')).toBeLessThan(wizard.indexOf('STEP 1: PRODUCT SELECTION'));
  });
});

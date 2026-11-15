import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiError } from '../src/modules/integrations/github/github-app.client';
import { GitHubSetupService } from '../src/modules/integrations/github/setup/github-setup.service';
import {
  SETUP_BRANCH,
  SetupGenerationError,
  addDependency,
  addImport,
  generateSetup,
  mergeEnvExample,
  relativeImport,
  wireNodeMiddleware,
  wrapJsxChildren,
  wrapPagesComponent
} from '../src/modules/integrations/github/setup/setup-generator';
import { RepoSnapshot, detectStack } from '../src/modules/integrations/github/setup/stack-detection';
import { syntaxError, validateGeneratedFiles } from '../src/modules/integrations/github/setup/validate';
import { mockDatabase } from './helpers/mock-db';

function repo(files: Record<string, string>): RepoSnapshot {
  return { paths: Object.keys(files), read: async (path) => (path in files ? files[path] : null) };
}

const pkg = (value: Record<string, unknown>) => JSON.stringify(value, null, 2) + '\n';
const context = { projectId: 'proj_123', projectName: 'Web', apiUrl: 'https://api.traceiq.run', dashboardUrl: 'https://traceiq.run' };

const NEXT_LAYOUT = `import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Acme' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const nextApp = {
  'package.json': pkg({ name: 'web', dependencies: { next: '14.2.5', react: '18.3.1', 'react-dom': '18.3.1' } }),
  'pnpm-lock.yaml': '',
  'tsconfig.json': '{}',
  'src/app/layout.tsx': NEXT_LAYOUT,
  'src/app/page.tsx': 'export default function Page() { return <main />; }\n'
};

const viteApp = {
  'package.json': pkg({ name: 'spa', dependencies: { react: '18.3.1', 'react-dom': '18.3.1' }, devDependencies: { vite: '5.0.0' } }),
  'yarn.lock': '',
  'src/main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n`,
  'tsconfig.json': '{}'
};

const expressApp = {
  'package.json': pkg({ name: 'api', main: 'server.js', scripts: { start: 'node server.js' }, dependencies: { express: '4.19.0' } }),
  'package-lock.json': '{}',
  'server.js': `const express = require('express');\n\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));\napp.listen(3000);\n`
};

describe('stack detection', () => {
  it('detects Next.js App Router with src/, TypeScript and pnpm', async () => {
    const detection = await detectStack(repo(nextApp));
    expect(detection).toMatchObject({
      kind: 'app',
      app: {
        folder: '',
        framework: 'nextjs',
        label: 'Next.js (App Router)',
        supported: true,
        packageManager: 'pnpm',
        typescript: true,
        details: { router: 'app', srcDir: true, entry: 'src/app/layout.tsx' }
      }
    });
  });

  it('detects the Pages Router', async () => {
    const detection = await detectStack(repo({ 'package.json': pkg({ dependencies: { next: '13.0.0', react: '18' } }), 'pages/_app.js': 'export default function App({ Component, pageProps }) { return <Component {...pageProps} />; }' }));
    expect(detection).toMatchObject({ kind: 'app', app: { label: 'Next.js (Pages Router)', typescript: false, packageManager: 'npm', details: { router: 'pages', entry: 'pages/_app.js' } } });
  });

  it('detects React with Vite or Create React App', async () => {
    expect(await detectStack(repo(viteApp))).toMatchObject({ kind: 'app', app: { framework: 'react', label: 'React (Vite)', packageManager: 'yarn', details: { bundler: 'vite', entry: 'src/main.tsx' } } });
    const cra = await detectStack(repo({ 'package.json': pkg({ dependencies: { react: '18', 'react-scripts': '5' } }), 'src/index.js': 'import App from "./App";\n' }));
    expect(cra).toMatchObject({ kind: 'app', app: { label: 'React (Create React App)', details: { bundler: 'cra', entry: 'src/index.js' } } });
  });

  it('detects Node servers and their entry', async () => {
    expect(await detectStack(repo(expressApp))).toMatchObject({ kind: 'app', app: { framework: 'node', label: 'Express', details: { server: 'express', moduleType: 'cjs', entry: 'server.js' } } });
    const nest = await detectStack(repo({ 'package.json': pkg({ type: 'commonjs', main: 'dist/main.js', dependencies: { '@nestjs/core': '10' } }), 'src/main.ts': 'x', 'tsconfig.json': '{}' }));
    expect(nest).toMatchObject({ kind: 'app', app: { label: 'NestJS', typescript: true, details: { entry: 'src/main.ts' } } });
  });

  it('names unsupported stacks so the wizard can fall back to manual steps', async () => {
    expect(await detectStack(repo({ 'pubspec.yaml': 'name: app' }))).toMatchObject({ kind: 'app', app: { framework: 'flutter', label: 'Flutter', supported: false } });
    expect(await detectStack(repo({ 'Cargo.toml': '[package]' }))).toMatchObject({ kind: 'app', app: { framework: 'rust', supported: false } });
    expect(await detectStack(repo({ 'package.json': pkg({ dependencies: { expo: '50', 'react-native': '0.73' } }) }))).toMatchObject({ kind: 'app', app: { framework: 'react-native', label: 'React Native (Expo)', supported: false } });
    expect(await detectStack(repo({ 'README.md': '# hi' }))).toMatchObject({ kind: 'app', app: { framework: 'unknown', supported: false } });
  });

  it('asks which folder to use in a monorepo with several apps, supported first', async () => {
    const monorepo = repo({
      'package.json': pkg({ name: 'root', private: true, workspaces: ['apps/*'] }),
      'pnpm-lock.yaml': '',
      'apps/web/package.json': pkg({ dependencies: { next: '14', react: '18' } }),
      'apps/web/app/layout.tsx': NEXT_LAYOUT,
      'apps/mobile/pubspec.yaml': 'name: mobile',
      'apps/api/package.json': pkg({ dependencies: { express: '4' } }),
      'apps/api/index.js': 'const app = require("express")();',
      'node_modules/x/package.json': pkg({ dependencies: { next: '1' } })
    });
    const detection = await detectStack(monorepo);
    expect(detection.kind).toBe('pick_folder');
    if (detection.kind !== 'pick_folder') return;
    expect(detection.candidates.map((app) => [app.folder, app.label, app.supported])).toEqual([
      ['apps/api', 'Express', true],
      ['apps/web', 'Next.js (App Router)', true],
      ['apps/mobile', 'Flutter', false]
    ]);
    // The lockfile is found at the workspace root.
    expect(detection.candidates[1].packageManager).toBe('pnpm');

    // Once a folder is chosen it is used as is.
    expect(await detectStack(monorepo, 'apps/web')).toMatchObject({ kind: 'app', app: { folder: 'apps/web', label: 'Next.js (App Router)', details: { entry: 'apps/web/app/layout.tsx' } } });
  });

  it('picks the only app in a monorepo automatically, and notices TraceIQ is already there', async () => {
    const single = await detectStack(repo({
      'package.json': pkg({ workspaces: ['apps/*'] }),
      'apps/web/package.json': pkg({ dependencies: { next: '14', react: '18', 'traceiq-sdk-js': '^0.4.0' } }),
      'apps/web/app/layout.js': NEXT_LAYOUT
    }));
    expect(single).toMatchObject({ kind: 'app', app: { folder: 'apps/web', alreadyInstalled: true } });
  });
});

describe('setup generator', () => {
  it('Next.js App Router: provider, wrapped JSX children, dependency and env example', async () => {
    const detection = await detectStack(repo(nextApp));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(nextApp), context);

    expect(plan.files.map((file) => [file.path, file.action])).toEqual([
      ['src/components/traceiq-provider.tsx', 'create'],
      ['src/app/layout.tsx', 'update'],
      ['package.json', 'update'],
      ['.env.example', 'create']
    ]);
    const layout = plan.files.find((file) => file.path === 'src/app/layout.tsx')!.content;
    expect(layout).toContain("import { TraceIQProvider } from '../components/traceiq-provider';");
    expect(layout).toContain('<body><TraceIQProvider>{children}</TraceIQProvider></body>');
    // The parameter is untouched.
    expect(layout).toContain('RootLayout({ children }: { children: React.ReactNode })');

    const provider = plan.files[0].content;
    expect(provider.startsWith("'use client';")).toBe(true);
    expect(provider).toContain('process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY');

    const manifest = JSON.parse(plan.files.find((file) => file.path === 'package.json')!.content);
    expect(manifest.dependencies).toEqual({ next: '14.2.5', react: '18.3.1', 'react-dom': '18.3.1', 'traceiq-sdk-js': '^0.4.0' });
    expect(Object.keys(manifest.dependencies)).toEqual(['next', 'react', 'react-dom', 'traceiq-sdk-js']);

    const env = plan.files.find((file) => file.path === '.env.example')!.content;
    expect(env).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=proj_123');
    expect(env).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=\n');
    expect(env).toContain('NEXT_PUBLIC_TRACEIQ_API_URL=https://api.traceiq.run');
    expect(plan.manualSteps).toEqual([]);
    expect(plan.installCommand).toBe('pnpm install');
    expect(validateGeneratedFiles(plan.files)).toEqual([]);
  });

  it('never puts a write key in the change, and the PR body explains secrets and the lockfile', async () => {
    const detection = await detectStack(repo(nextApp));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(nextApp), context);
    const everything = plan.files.map((file) => file.content).join('\n') + plan.body;
    expect(everything).not.toMatch(/tiq_(live|test|wk)_\w+/);
    expect(plan.envVars.find((item) => item.secret)?.exampleValue).toBe('');
    expect(plan.body).toContain('Update the lockfile');
    expect(plan.body).toContain('run `pnpm install`');
    expect(plan.body).toContain('The write key is **not** in this PR');
    expect(plan.body).toContain('| `NEXT_PUBLIC_TRACEIQ_WRITE_KEY` | your write key');
    expect(plan.body).toContain('nothing was pushed to your default branch');
  });

  it('Pages Router and JavaScript', async () => {
    const files = {
      'package.json': pkg({ dependencies: { next: '13', react: '18' } }),
      'pages/_app.js': `export default function App({ Component, pageProps }) {\n  return <Component {...pageProps} />;\n}\n`
    };
    const detection = await detectStack(repo(files));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(files), context);
    expect(plan.files.map((file) => file.path)).toContain('components/traceiq-provider.jsx');
    const app = plan.files.find((file) => file.path === 'pages/_app.js')!.content;
    expect(app).toContain("import { TraceIQProvider } from '../components/traceiq-provider';");
    expect(app).toContain('<TraceIQProvider><Component {...pageProps} /></TraceIQProvider>');
    expect(plan.files[0].content).not.toContain('ReactNode');
    expect(validateGeneratedFiles(plan.files)).toEqual([]);
  });

  it('falls back to a manual step when the layout cannot be edited safely', async () => {
    const files = { ...nextApp, 'src/app/layout.tsx': 'export default function RootLayout(props) { return props.children; }\n' };
    const detection = await detectStack(repo(files));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(files), context);
    expect(plan.files.map((file) => file.path)).not.toContain('src/app/layout.tsx');
    expect(plan.manualSteps[0]).toMatch(/Wrap the `\{children\}`/);
    expect(plan.body).toContain('Finish by hand');
  });

  it('React (Vite): init module imported first in the entry, VITE_ variables, existing env example extended', async () => {
    const files = { ...viteApp, '.env.example': 'API_BASE=https://example.test\n' };
    const detection = await detectStack(repo(files));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(files), context);
    expect(plan.files.find((file) => file.path === 'src/traceiq.ts')!.content).toContain('import.meta.env.VITE_TRACEIQ_WRITE_KEY');
    expect(plan.files.find((file) => file.path === 'src/main.tsx')!.content.split('\n')[0]).toBe("import './traceiq';");
    const env = plan.files.find((file) => file.path === '.env.example')!;
    expect(env.action).toBe('update');
    expect(env.content.startsWith('API_BASE=https://example.test\n\n# TraceIQ')).toBe(true);
    expect(plan.installCommand).toBe('yarn install');
    expect(validateGeneratedFiles(plan.files)).toEqual([]);
  });

  it('Express (CommonJS): shared client module and middleware after `const app = express()`', async () => {
    const detection = await detectStack(repo(expressApp));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(expressApp), context);
    const module = plan.files.find((file) => file.path === 'traceiq.js')!.content;
    expect(module).toContain("const { TraceIQ } = require('traceiq-node');");
    expect(module).toContain('module.exports = { traceiq };');
    const server = plan.files.find((file) => file.path === 'server.js')!.content;
    expect(server).toContain("const { traceiq } = require('./traceiq');");
    expect(server).toContain('const app = express();\nif (traceiq) app.use(traceiq.middleware());');
    expect(JSON.parse(plan.files.find((file) => file.path === 'package.json')!.content).dependencies['traceiq-node']).toBe('^0.3.0');
    expect(plan.envVars.map((item) => item.name)).toEqual(['TRACEIQ_PROJECT_ID', 'TRACEIQ_WRITE_KEY', 'TRACEIQ_ENDPOINT']);
    expect(validateGeneratedFiles(plan.files)).toEqual([]);
  });

  it('NestJS (TypeScript) and ESM imports', async () => {
    const files = {
      'package.json': pkg({ dependencies: { '@nestjs/core': '10' } }),
      'tsconfig.json': '{}',
      'src/main.ts': `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n}\nbootstrap();\n`
    };
    const detection = await detectStack(repo(files));
    if (detection.kind !== 'app') throw new Error('expected app');
    const plan = await generateSetup(detection.app, repo(files), context);
    const main = plan.files.find((file) => file.path === 'src/main.ts')!.content;
    expect(main).toContain("import { traceiq } from './traceiq';");
    expect(main).toContain('  const app = await NestFactory.create(AppModule);\n  if (traceiq) app.use(traceiq.middleware());');
    expect(validateGeneratedFiles(plan.files)).toEqual([]);

    const esm = { 'package.json': pkg({ type: 'module', dependencies: { express: '4' } }), 'index.js': `import express from 'express';\nconst app = express();\n` };
    const esmDetection = await detectStack(repo(esm));
    if (esmDetection.kind !== 'app') throw new Error('expected app');
    const esmPlan = await generateSetup(esmDetection.app, repo(esm), context);
    expect(esmPlan.files.find((file) => file.path === 'index.js')!.content).toContain("import { traceiq } from './traceiq.mjs';");
    expect(validateGeneratedFiles(esmPlan.files)).toEqual([]);
  });

  it('refuses unsupported, already-installed and conflicting setups', async () => {
    const flutter = await detectStack(repo({ 'pubspec.yaml': 'name: x' }));
    if (flutter.kind !== 'app') throw new Error('expected app');
    await expect(generateSetup(flutter.app, repo({}), context)).rejects.toMatchObject({ code: 'SETUP_UNSUPPORTED' });

    const installed = { ...nextApp, 'package.json': pkg({ dependencies: { next: '14', 'traceiq-sdk-js': '^0.4.0' } }) };
    const installedDetection = await detectStack(repo(installed));
    if (installedDetection.kind !== 'app') throw new Error('expected app');
    await expect(generateSetup(installedDetection.app, repo(installed), context)).rejects.toMatchObject({ code: 'SETUP_ALREADY_INSTALLED' });

    const conflict = { ...nextApp, 'src/components/traceiq-provider.tsx': 'export {}' };
    const conflictDetection = await detectStack(repo(conflict));
    if (conflictDetection.kind !== 'app') throw new Error('expected app');
    await expect(generateSetup(conflictDetection.app, repo(conflict), context)).rejects.toBeInstanceOf(SetupGenerationError);
  });

  it('refuses to produce files that do not parse', async () => {
    // A layout that already does not parse stays broken after the edit: no PR.
    const broken = { ...nextApp, 'src/app/layout.tsx': 'export default function RootLayout({ children }) { return <body>{children}</body> ' };
    const detection = await detectStack(repo(broken));
    if (detection.kind !== 'app') throw new Error('expected app');
    await expect(generateSetup(detection.app, repo(broken), context)).rejects.toMatchObject({ code: 'SETUP_INVALID_OUTPUT' });
  });
});

describe('generator edits', () => {
  it('wraps only the JSX children, never the parameter', () => {
    expect(wrapJsxChildren('function L({ children }) { return <body>{children}</body>; }')).toBe(
      'function L({ children }) { return <body><TraceIQProvider>{children}</TraceIQProvider></body>; }'
    );
    expect(wrapJsxChildren('function L({ children }: P) { return children; }')).toBeNull();
    expect(wrapJsxChildren('<TraceIQProvider>{children}</TraceIQProvider>')).toBeNull();
    expect(wrapPagesComponent('<A/><Component {...pageProps} /><Component {...pageProps} />')).toBeNull();
  });

  it('adds imports after directives and leading comments', () => {
    expect(addImport("'use client';\n\nimport a from 'a';\n", "import b from 'b';")).toBe("'use client';\n\nimport b from 'b';\nimport a from 'a';\n");
    expect(addImport('/**\n * header\n */\nimport a from "a";', "import b from 'b';")).toBe('/**\n * header\n */\n\nimport b from \'b\';\nimport a from "a";');
    expect(addImport("import b from 'b';\n", "import b from 'b';")).toBe("import b from 'b';\n");
  });

  it('only wires middleware when the app line is unambiguous', () => {
    const app = { framework: 'node', details: { moduleType: 'cjs' }, typescript: false } as never;
    expect(wireNodeMiddleware('const app = express();\nconst app = express();', 'a.js', 'traceiq.js', app)).toBeNull();
    expect(wireNodeMiddleware('const server = http.createServer();', 'a.js', 'traceiq.js', app)).toBeNull();
  });

  it('keeps package.json formatting and order', () => {
    const tabbed = '{\n\t"name": "x",\n\t"dependencies": {\n\t\t"zeta": "1",\n\t\t"alpha": "1"\n\t}\n}';
    const result = addDependency(tabbed, 'traceiq-sdk-js', '^0.4.0');
    expect(result).toContain('\t"dependencies"');
    expect(Object.keys(JSON.parse(result).dependencies)).toEqual(['zeta', 'alpha', 'traceiq-sdk-js']);
    expect(result.endsWith('\n')).toBe(false);
    expect(JSON.parse(addDependency('{"name":"x"}\n', 'traceiq-node', '^0.3.0')).dependencies).toEqual({ 'traceiq-node': '^0.3.0' });
  });

  it('does not duplicate env names and computes relative imports', () => {
    const vars = [{ name: 'A', exampleValue: '1', secret: false, description: '' }];
    expect(mergeEnvExample('A=old\n', vars)).toBeNull();
    expect(relativeImport('src/app/layout.tsx', 'src/components/traceiq-provider.tsx')).toBe('../components/traceiq-provider');
    expect(relativeImport('src/main.tsx', 'src/traceiq.ts')).toBe('./traceiq');
    expect(relativeImport('apps/web/pages/_app.js', 'apps/web/components/traceiq-provider.jsx')).toBe('../components/traceiq-provider');
  });

  it('validates syntax with the TypeScript parser and JSON.parse', () => {
    expect(syntaxError('a.tsx', 'export const A = () => <div>{1}</div>;')).toBeNull();
    expect(syntaxError('a.ts', 'const = ;')).not.toBeNull();
    expect(syntaxError('a.jsx', 'const x = <div>;')).not.toBeNull();
    expect(syntaxError('package.json', '{"a":')).not.toBeNull();
    expect(syntaxError('.env.example', 'anything')).toBeNull();
  });
});

describe('GitHubSetupService', () => {
  const user = { id: 'usr_owner', authMethod: 'supabase' as const };
  const repoInfo = { id: 1, fullName: 'acme/web', defaultBranch: 'main', private: true, htmlUrl: 'https://github.com/acme/web' };
  const pull = { number: 7, url: 'https://github.com/acme/web/pull/7', state: 'open', head: SETUP_BRANCH, base: 'main' };
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let githubService: { requireLinkedProject: ReturnType<typeof vi.fn> };
  let db: ReturnType<typeof mockDatabase>;
  let service: GitHubSetupService;
  let files: Record<string, string>;

  beforeEach(() => {
    files = { ...nextApp };
    client = {
      getRepo: vi.fn().mockResolvedValue(repoInfo),
      findOpenPullRequest: vi.fn().mockResolvedValue(null),
      getTree: vi.fn(async () => ({ entries: Object.keys(files).map((path) => ({ path, type: 'blob' })), truncated: false })),
      readFile: vi.fn(async (_id: number, _repo: string, path: string) => files[path] ?? null),
      getBranchSha: vi.fn(async (_id: number, _repo: string, branch: string) => (branch === 'main' ? 'base_sha' : null)),
      createBranch: vi.fn().mockResolvedValue(undefined),
      commitFiles: vi.fn().mockResolvedValue('commit_sha'),
      createPullRequest: vi.fn().mockResolvedValue(pull)
    };
    githubService = {
      requireLinkedProject: vi.fn().mockResolvedValue({
        project: { id: 'proj_1', name: 'Web', organizationId: 'org_1', role: 'owner' },
        installation: { installationId: '77' },
        link: { repoFullName: 'acme/web', appSubdirectory: '' }
      })
    };
    db = mockDatabase();
    service = new GitHubSetupService(db as never, githubService as never, client as never);
  });

  it('branches from the default branch, commits there, and opens a PR against the default branch', async () => {
    const result = await service.createSetupPullRequest(user, 'proj_1');
    expect(result).toMatchObject({ created: true, pullRequest: { url: 'https://github.com/acme/web/pull/7' }, app: { label: 'Next.js (App Router)' } });
    expect(client.createBranch).toHaveBeenCalledWith(77, repoInfo, 'traceiq/setup', 'base_sha');
    const [, , branch, committed] = client.commitFiles.mock.calls[0];
    expect(branch).toBe('traceiq/setup');
    expect(committed.map((file: { path: string }) => file.path)).toEqual(['src/components/traceiq-provider.tsx', 'src/app/layout.tsx', 'package.json', '.env.example']);
    expect(client.createPullRequest.mock.calls[0][2]).toMatchObject({ head: 'traceiq/setup', title: 'Set up TraceIQ analytics' });
    expect(db.queryCalls('INSERT INTO github_setup_pull_requests')[0].values).toEqual([
      'proj_1', 'acme/web', 'traceiq/setup', 7, 'https://github.com/acme/web/pull/7', 'Next.js (App Router)', '', 'usr_owner'
    ]);
    // Reads only what it needs from the default branch.
    expect(client.readFile.mock.calls.every((call) => call[3] === 'main')).toBe(true);
  });

  it('is idempotent: an open setup PR is returned without touching the repository', async () => {
    client.findOpenPullRequest.mockResolvedValue(pull);
    await expect(service.createSetupPullRequest(user, 'proj_1')).resolves.toEqual({ created: false, pullRequest: pull });
    expect(client.createBranch).not.toHaveBeenCalled();
    expect(client.commitFiles).not.toHaveBeenCalled();
    expect(client.createPullRequest).not.toHaveBeenCalled();
  });

  it('reuses an existing setup branch and survives a concurrent request opening the PR', async () => {
    client.getBranchSha.mockResolvedValue('existing_sha');
    client.createPullRequest.mockRejectedValue(new GitHubApiError('A pull request already exists', 422));
    client.findOpenPullRequest.mockResolvedValueOnce(null).mockResolvedValueOnce(pull);
    await expect(service.createSetupPullRequest(user, 'proj_1')).resolves.toMatchObject({ created: false, pullRequest: pull });
    expect(client.createBranch).not.toHaveBeenCalled();
    expect(client.commitFiles).toHaveBeenCalledTimes(1);
  });

  it('treats "branch already exists" from a concurrent request as fine', async () => {
    client.createBranch.mockRejectedValue(new GitHubApiError('Reference already exists', 422));
    await expect(service.createSetupPullRequest(user, 'proj_1')).resolves.toMatchObject({ created: true });
  });

  it('asks for a folder in a monorepo, and refuses unsupported stacks, without writing', async () => {
    files = {
      'package.json': pkg({ workspaces: ['apps/*'] }),
      'apps/web/package.json': pkg({ dependencies: { next: '14' } }),
      'apps/web/app/layout.tsx': NEXT_LAYOUT,
      'apps/api/package.json': pkg({ dependencies: { express: '4' } })
    };
    await expect(service.createSetupPullRequest(user, 'proj_1')).rejects.toMatchObject({ response: { code: 'SETUP_PICK_FOLDER' } });
    await expect(service.createSetupPullRequest(user, 'proj_1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.preview(user, 'proj_1')).resolves.toMatchObject({ status: 'pick_folder', candidates: [{ folder: 'apps/api' }, { folder: 'apps/web' }] });

    files = { 'pubspec.yaml': 'name: app' };
    await expect(service.createSetupPullRequest(user, 'proj_1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.preview(user, 'proj_1')).resolves.toMatchObject({ status: 'unsupported', app: { label: 'Flutter' } });
    expect(client.createBranch).not.toHaveBeenCalled();
    expect(client.commitFiles).not.toHaveBeenCalled();
  });

  it('previews the plan without writing anything', async () => {
    const preview = await service.preview(user, 'proj_1');
    expect(preview).toMatchObject({
      status: 'ready',
      app: { label: 'Next.js (App Router)' },
      plan: { installCommand: 'pnpm install', envVars: [{ name: 'NEXT_PUBLIC_TRACEIQ_PROJECT_ID' }, { name: 'NEXT_PUBLIC_TRACEIQ_WRITE_KEY', secret: true }, { name: 'NEXT_PUBLIC_TRACEIQ_API_URL' }] }
    });
    expect(client.createBranch).not.toHaveBeenCalled();
    expect(client.commitFiles).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('maps GitHub failures to HTTP errors', async () => {
    client.getRepo.mockRejectedValue(new GitHubApiError('Not Found', 404));
    await expect(service.createSetupPullRequest(user, 'proj_1')).rejects.toMatchObject({ response: { code: 'GITHUB_NOT_FOUND' } });
  });
});

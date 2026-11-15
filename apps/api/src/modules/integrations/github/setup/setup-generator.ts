import { DetectedApp, PackageManager, RepoSnapshot, joinPath } from './stack-detection';
import { validateGeneratedFiles } from './validate';

/**
 * Turns a detected app into the files of a setup pull request. Deterministic templates,
 * no LLM: the same repository always produces the same change. The write key is never
 * written anywhere; code reads it from an environment variable and the PR explains
 * where to set it.
 *
 * Templates follow the useTrace CLI and the dashboard's install prompt: a "use client"
 * provider that initializes once in useEffect and wraps the JSX {children} (never the
 * layout's parameter), and the same environment variable names.
 */

export const SDK_PACKAGES = {
  browser: { name: 'traceiq-sdk-js', range: '^0.4.0' },
  node: { name: 'traceiq-node', range: '^0.3.0' }
} as const;

export const SETUP_BRANCH = 'traceiq/setup';

export interface SetupContext {
  projectId: string;
  projectName: string;
  apiUrl: string;
  dashboardUrl: string;
}

export interface PlannedFile {
  path: string;
  content: string;
  action: 'create' | 'update';
}

export interface EnvVar {
  name: string;
  /** Committed in the example file. Never set for the write key. */
  exampleValue: string;
  secret: boolean;
  description: string;
}

export interface SetupPlan {
  app: DetectedApp;
  files: PlannedFile[];
  envVars: EnvVar[];
  /** Things the generator could not do safely; listed in the PR for a person to do. */
  manualSteps: string[];
  installCommand: string;
  title: string;
  body: string;
}

export class SetupGenerationError extends Error {
  readonly name = 'SetupGenerationError';

  constructor(readonly code: 'SETUP_UNSUPPORTED' | 'SETUP_ALREADY_INSTALLED' | 'SETUP_FILE_EXISTS' | 'SETUP_INVALID_OUTPUT', message: string) {
    super(message);
  }
}

export async function generateSetup(app: DetectedApp, snapshot: RepoSnapshot, context: SetupContext): Promise<SetupPlan> {
  if (!app.supported) {
    throw new SetupGenerationError('SETUP_UNSUPPORTED', `${app.label} can't be set up automatically yet. Use the manual steps in the Setup Wizard.`);
  }
  if (app.alreadyInstalled) {
    throw new SetupGenerationError('SETUP_ALREADY_INSTALLED', 'A TraceIQ SDK is already a dependency of this app. Nothing to set up.');
  }

  const paths = new Set(snapshot.paths);
  const files: PlannedFile[] = [];
  const manualSteps: string[] = [];
  const create = (path: string, content: string) => {
    if (paths.has(path)) throw new SetupGenerationError('SETUP_FILE_EXISTS', `${path} already exists. Remove or rename it, or set TraceIQ up manually.`);
    files.push({ path, content, action: 'create' });
  };
  const update = (path: string, content: string) => files.push({ path, content, action: 'update' });

  let envVars: EnvVar[];
  const sdk = app.framework === 'node' ? SDK_PACKAGES.node : SDK_PACKAGES.browser;

  if (app.framework === 'nextjs') {
    envVars = envFor('NEXT_PUBLIC_TRACEIQ', 'API_URL', context, false);
    const base = joinPath(app.folder, app.details.srcDir ? 'src' : '');
    const ext = app.typescript ? 'tsx' : 'jsx';
    const providerPath = joinPath(base, `components/traceiq-provider.${ext}`);
    create(providerPath, nextProvider(app.typescript));

    const entry = app.details.entry;
    const entryText = entry ? await snapshot.read(entry) : null;
    let mounted = false;
    if (entry && entryText !== null) {
      const importLine = `import { TraceIQProvider } from '${relativeImport(entry, providerPath)}';`;
      const wrapped = app.details.router === 'app' ? wrapJsxChildren(entryText) : wrapPagesComponent(entryText);
      if (wrapped !== null) {
        update(entry, addImport(wrapped, importLine));
        mounted = true;
      }
    }
    if (!mounted) {
      manualSteps.push(
        app.details.router === 'pages'
          ? `Wrap \`<Component {...pageProps} />\` in \`pages/_app\` with \`<TraceIQProvider>\` (from \`${providerPath}\`).`
          : `Wrap the \`{children}\` rendered in your root layout with \`<TraceIQProvider>\` (from \`${providerPath}\`). Only the JSX \`{children}\`, not the function parameter.`
      );
    }
  } else if (app.framework === 'react') {
    const vite = app.details.bundler === 'vite';
    envVars = vite ? envFor('VITE_TRACEIQ', 'API_URL', context, false) : envFor('REACT_APP_TRACEIQ', 'API_URL', context, false);
    const initPath = joinPath(app.folder, `src/traceiq.${app.typescript ? 'ts' : 'js'}`);
    create(initPath, vite ? viteInit() : craInit());
    const entry = app.details.entry!;
    const entryText = await snapshot.read(entry);
    if (entryText === null) {
      manualSteps.push(`Import \`./traceiq\` at the top of your entry file so TraceIQ starts with the app.`);
    } else {
      update(entry, addImport(entryText, `import '${relativeImport(entry, initPath)}';`));
    }
  } else {
    envVars = envFor('TRACEIQ', 'ENDPOINT', context, true);
    const entry = app.details.entry;
    const inSrc = entry ? entry.slice(app.folder ? app.folder.length + 1 : 0).startsWith('src/') : false;
    const esm = app.details.moduleType === 'esm';
    const modulePath = joinPath(app.folder, `${inSrc ? 'src/' : ''}traceiq.${app.typescript ? 'ts' : esm ? 'mjs' : 'js'}`);
    create(modulePath, nodeModule(app.typescript, esm));

    const entryText = entry ? await snapshot.read(entry) : null;
    const wired = entry && entryText !== null ? wireNodeMiddleware(entryText, entry, modulePath, app) : null;
    if (wired !== null && entry) {
      update(entry, wired);
    } else {
      manualSteps.push(
        `Import \`traceiq\` from \`${modulePath}\` where your server is created and add \`if (traceiq) app.use(traceiq.middleware());\`, or send events with \`traceiq?.capture({ event, userId, properties })\`.`
      );
    }
    manualSteps.push('For short-lived processes (scripts, serverless functions), call `await traceiq?.shutdown()` before exiting so queued events are sent.');
  }

  // Dependency (the lockfile is updated by the person; see the PR body).
  const packagePath = joinPath(app.folder, 'package.json');
  const packageText = await snapshot.read(packagePath);
  if (packageText === null) throw new SetupGenerationError('SETUP_UNSUPPORTED', 'package.json could not be read.');
  update(packagePath, addDependency(packageText, sdk.name, sdk.range));

  // Example env file: names and public values only.
  const examplePath = joinPath(app.folder, '.env.example');
  const exampleText = await snapshot.read(examplePath);
  const example = mergeEnvExample(exampleText, envVars);
  if (example !== null) (exampleText === null ? create : update)(examplePath, example);

  // Refuse to open a PR whose files do not parse.
  const invalid = validateGeneratedFiles(files);
  if (invalid.length) {
    throw new SetupGenerationError(
      'SETUP_INVALID_OUTPUT',
      `The generated change would not parse (${invalid.map((item) => item.path).join(', ')}). Set TraceIQ up manually for now.`
    );
  }

  const installCommand = installCommandFor(app.packageManager ?? 'npm');
  return {
    app,
    files,
    envVars,
    manualSteps,
    installCommand,
    title: 'Set up TraceIQ analytics',
    body: pullRequestBody({ app, files, envVars, manualSteps, installCommand, context, sdkName: sdk.name })
  };
}

// ------------------------------------------------------------------ templates

function envFor(prefix: string, urlName: 'API_URL' | 'ENDPOINT', context: SetupContext, server: boolean): EnvVar[] {
  return [
    { name: `${prefix}_PROJECT_ID`, exampleValue: context.projectId, secret: false, description: 'Your TraceIQ project id (not secret).' },
    {
      name: `${prefix}_WRITE_KEY`,
      exampleValue: '',
      secret: true,
      description: server
        ? 'The project write key. Keep it secret: set it only in your host and CI secrets.'
        : 'The project write key. Browser keys can only send events, but keep it out of git and set it in your host’s environment settings.'
    },
    { name: `${prefix}_${urlName}`, exampleValue: context.apiUrl, secret: false, description: 'The TraceIQ API endpoint.' }
  ];
}

function nextProvider(typescript: boolean): string {
  const props = typescript ? '{ children }: { children: ReactNode }' : '{ children }';
  const typeImport = typescript ? ', type ReactNode' : '';
  return `'use client';

import { useEffect${typeImport} } from 'react';
import { traceiq } from 'traceiq-sdk-js';

let initialized = false;

/** Starts TraceIQ once in the browser. Added by the TraceIQ setup pull request. */
export function TraceIQProvider(${props}) {
  useEffect(() => {
    if (initialized) return;
    const projectId = process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID;
    const writeKey = process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY;
    const endpoint = process.env.NEXT_PUBLIC_TRACEIQ_API_URL || 'https://api.traceiq.run';
    if (!projectId || !writeKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[TraceIQ] Not started: set NEXT_PUBLIC_TRACEIQ_PROJECT_ID and NEXT_PUBLIC_TRACEIQ_WRITE_KEY, then restart.');
      }
      return;
    }
    try {
      traceiq.initialize({
        projectId,
        writeKey,
        endpoint,
        autoTrackPageViews: true,
        autoCaptureExceptions: true,
        autoCaptureRageClicks: true
      });
      initialized = true;
    } catch (error) {
      // Analytics must never break the app.
      if (process.env.NODE_ENV === 'development') console.warn('[TraceIQ] Initialization failed', error);
    }
  }, []);

  return <>{children}</>;
}
`;
}

function viteInit(): string {
  return `import { traceiq } from 'traceiq-sdk-js';

// Starts TraceIQ once, when this module is first imported. Added by the TraceIQ setup pull request.
const projectId = import.meta.env.VITE_TRACEIQ_PROJECT_ID;
const writeKey = import.meta.env.VITE_TRACEIQ_WRITE_KEY;
const endpoint = import.meta.env.VITE_TRACEIQ_API_URL || 'https://api.traceiq.run';

if (projectId && writeKey) {
  try {
    traceiq.initialize({
      projectId,
      writeKey,
      endpoint,
      autoTrackPageViews: true,
      autoCaptureExceptions: true,
      autoCaptureRageClicks: true
    });
  } catch (error) {
    // Analytics must never break the app.
    if (import.meta.env.DEV) console.warn('[TraceIQ] Initialization failed', error);
  }
} else if (import.meta.env.DEV) {
  console.warn('[TraceIQ] Not started: set VITE_TRACEIQ_PROJECT_ID and VITE_TRACEIQ_WRITE_KEY, then restart.');
}

export { traceiq };
`;
}

function craInit(): string {
  return `import { traceiq } from 'traceiq-sdk-js';

// Starts TraceIQ once, when this module is first imported. Added by the TraceIQ setup pull request.
const projectId = process.env.REACT_APP_TRACEIQ_PROJECT_ID;
const writeKey = process.env.REACT_APP_TRACEIQ_WRITE_KEY;
const endpoint = process.env.REACT_APP_TRACEIQ_API_URL || 'https://api.traceiq.run';

if (projectId && writeKey) {
  try {
    traceiq.initialize({
      projectId,
      writeKey,
      endpoint,
      autoTrackPageViews: true,
      autoCaptureExceptions: true,
      autoCaptureRageClicks: true
    });
  } catch (error) {
    // Analytics must never break the app.
    if (process.env.NODE_ENV === 'development') console.warn('[TraceIQ] Initialization failed', error);
  }
} else if (process.env.NODE_ENV === 'development') {
  console.warn('[TraceIQ] Not started: set REACT_APP_TRACEIQ_PROJECT_ID and REACT_APP_TRACEIQ_WRITE_KEY, then restart.');
}

export { traceiq };
`;
}

function nodeModule(typescript: boolean, esm: boolean): string {
  const body = `const projectId = process.env.TRACEIQ_PROJECT_ID;
const writeKey = process.env.TRACEIQ_WRITE_KEY;

/**
 * One shared TraceIQ client for this process, or null when the environment variables are
 * not set (so the app still runs without them). Added by the TraceIQ setup pull request.
 */
${typescript || esm ? 'export ' : ''}const traceiq = projectId && writeKey
  ? new TraceIQ({
      projectId,
      writeKey,
      endpoint: process.env.TRACEIQ_ENDPOINT || 'https://api.traceiq.run'
    })
  : null;

if (!traceiq && process.env.NODE_ENV !== 'production') {
  console.warn('[TraceIQ] Not started: set TRACEIQ_PROJECT_ID and TRACEIQ_WRITE_KEY.');
}
`;
  if (typescript || esm) return `import { TraceIQ } from 'traceiq-node';\n\n${body}`;
  return `const { TraceIQ } = require('traceiq-node');\n\n${body}\nmodule.exports = { traceiq };\n`;
}

// ------------------------------------------------------------------ edits

const CHILDREN_EXPRESSION = /\{\s*children\s*\}/g;

/**
 * Wraps the `{children}` rendered in JSX with <TraceIQProvider>, never the destructured
 * parameter (`RootLayout({ children }: ...)`). Same rule as the CLI's layout.ts: the JSX
 * child sits next to a tag. Null when the layout does not render `{children}` directly
 * or already mounts the provider.
 */
export function wrapJsxChildren(source: string): string | null {
  if (/<TraceIQProvider[\s>]/.test(source)) return null;
  for (const match of source.matchAll(CHILDREN_EXPRESSION)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = source.slice(0, start).trimEnd().slice(-1);
    const after = source.slice(end).trimStart().charAt(0);
    if (before === '>' || after === '<') {
      return `${source.slice(0, start)}<TraceIQProvider>{children}</TraceIQProvider>${source.slice(end)}`;
    }
  }
  return null;
}

/** Pages Router: wraps the one `<Component {...pageProps} />`. */
export function wrapPagesComponent(source: string): string | null {
  if (/<TraceIQProvider[\s>]/.test(source)) return null;
  const pattern = /<Component\s+\{\.\.\.pageProps\}\s*\/>/g;
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) return null;
  return source.replace(pattern, '<TraceIQProvider><Component {...pageProps} /></TraceIQProvider>');
}

/**
 * Adds an import after the leading directives ('use client', 'use strict') and comments,
 * before the existing imports: always valid, whatever the rest of the file looks like.
 */
export function addImport(source: string, importLine: string): string {
  if (source.includes(importLine)) return source;
  const lines = source.split('\n');
  let index = 0;
  let inBlockComment = false;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      index += 1;
      continue;
    }
    if (line.startsWith('/*')) {
      inBlockComment = !line.includes('*/');
      index += 1;
      continue;
    }
    if (line === '' || line.startsWith('//') || line.startsWith('#!') || /^['"]use (client|strict|server)['"];?$/.test(line)) {
      index += 1;
      continue;
    }
    break;
  }
  const before = lines.slice(0, index);
  const after = lines.slice(index);
  const separator = before.length && before[before.length - 1].trim() !== '' ? [''] : [];
  return [...before, ...separator, importLine, ...after].join('\n');
}

/**
 * Express / NestJS: after the one `const app = express()` or `NestFactory.create(...)`,
 * adds the request middleware. Null when that line is not found exactly once.
 */
export function wireNodeMiddleware(source: string, entryPath: string, modulePath: string, app: DetectedApp): string | null {
  if (source.includes('traceiq.middleware(')) return null;
  const pattern = /^([ \t]*)(?:const|let|var)\s+app\s*=\s*(?:express\(\s*\)|await\s+NestFactory\.create(?:<[^>]*>)?\([^\n]*\));?[ \t]*$/gm;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const insertAt = (match.index ?? 0) + match[0].length;
  const indent = match[1];
  const withMiddleware = `${source.slice(0, insertAt)}\n${indent}if (traceiq) app.use(traceiq.middleware());${source.slice(insertAt)}`;

  const esm = app.details.moduleType === 'esm';
  let specifier = relativeImport(entryPath, modulePath);
  if (esm) specifier = `${specifier}.${modulePath.endsWith('.mjs') ? 'mjs' : 'js'}`;
  const usesRequire = !app.typescript && !esm && /\brequire\(/.test(source) && !/^\s*import\s/m.test(source);
  const importLine = usesRequire ? `const { traceiq } = require('${specifier}');` : `import { traceiq } from '${specifier}';`;
  return addImport(withMiddleware, importLine);
}

/** Adds the dependency, keeping the file's indentation and key order (sorted stays sorted). */
export function addDependency(packageText: string, name: string, range: string): string {
  const pkg = JSON.parse(packageText) as { dependencies?: Record<string, string> };
  const indentMatch = packageText.match(/^[ \t]+(?=")/m);
  const indent = indentMatch ? indentMatch[0] : 2;
  const existing = pkg.dependencies ?? {};
  const keys = Object.keys(existing);
  const sorted = keys.every((key, index) => index === 0 || keys[index - 1].localeCompare(key) <= 0);
  const next = { ...existing, [name]: range };
  pkg.dependencies = sorted ? Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))) : next;
  const trailingNewline = packageText.endsWith('\n') ? '\n' : '';
  return JSON.stringify(pkg, null, indent) + trailingNewline;
}

/** Adds the variables an example file does not have yet. Null when it already has them all. */
export function mergeEnvExample(existing: string | null, vars: EnvVar[]): string | null {
  const present = new Set(
    (existing ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0].trim())
  );
  const missing = vars.filter((item) => !present.has(item.name));
  if (!missing.length) return null;
  const block = [
    '# TraceIQ (added by the TraceIQ setup pull request). Set the real write key in your',
    '# host and CI secrets; never commit it.',
    ...missing.map((item) => `${item.name}=${item.exampleValue}`)
  ].join('\n');
  if (existing === null || !existing.trim()) return `${block}\n`;
  return `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
}

/** `./x` style specifier from one repository file to another, without the extension. */
export function relativeImport(fromFile: string, toFile: string): string {
  const from = fromFile.split('/').slice(0, -1);
  const to = toFile.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '').split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  const up = from.length - common;
  const rest = to.slice(common).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

function installCommandFor(manager: PackageManager): string {
  return { npm: 'npm install', pnpm: 'pnpm install', yarn: 'yarn install', bun: 'bun install' }[manager];
}

// ------------------------------------------------------------------ pull request text

function pullRequestBody(input: {
  app: DetectedApp;
  files: PlannedFile[];
  envVars: EnvVar[];
  manualSteps: string[];
  installCommand: string;
  context: SetupContext;
  sdkName: string;
}): string {
  const { app, files, envVars, manualSteps, installCommand, context, sdkName } = input;
  const where = app.folder ? ` in \`${app.folder}\`` : '';
  const cd = app.folder ? `cd ${app.folder} && ` : '';
  const lines = [
    `This pull request sets up [TraceIQ](${context.dashboardUrl}) for **${escapeMarkdown(context.projectName)}**${where}.`,
    '',
    `Detected: **${app.label}**, package manager **${app.packageManager ?? 'npm'}**. TraceIQ opened it from your project's Setup Wizard; nothing was pushed to your default branch.`,
    '',
    '### What changes',
    ...files.map((file) => `- \`${file.path}\` (${file.action === 'create' ? 'new' : 'updated'})`),
    '',
    '### Before you merge',
    '',
    `1. **Update the lockfile.** This PR adds \`${sdkName}\` to \`package.json\` but cannot run your package manager. Check out this branch, run \`${cd}${installCommand}\`, and commit the lockfile. CI that installs with a frozen lockfile fails until you do.`,
    '2. **Add the environment variables** where the app runs (Vercel, Netlify, Render, Fly, your server) and in CI if it builds the app:',
    '',
    '   | Name | Value |',
    '   | --- | --- |',
    ...envVars.map((item) => `   | \`${item.name}\` | ${item.secret ? 'your write key (copy it from TraceIQ → Setup Wizard)' : `\`${item.exampleValue}\``} |`),
    '',
    `   The write key is **not** in this PR. Add it as a secret in your host's environment settings (and your CI's secret store), and to your local \`.env\` file, which should stay git-ignored. \`.env.example\` only lists the names.`
  ];
  if (manualSteps.length) {
    lines.push('3. **Finish by hand.** TraceIQ could not do these safely:', ...manualSteps.map((step) => `   - ${step}`));
  }
  lines.push(
    '',
    '### Check it works',
    '',
    `Run the app with the variables set and open it, or deploy a preview. The Setup Wizard in TraceIQ shows **Connected** when the first event arrives.`,
    '',
    '---',
    '_Generated by TraceIQ from deterministic templates. Review it like any other change._'
  );
  return lines.join('\n');
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()<>#+!|~])/g, '\\$1');
}

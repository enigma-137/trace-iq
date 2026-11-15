/**
 * Works out what kind of app lives in a repository folder, from the file list and a few
 * manifests. Pure: it takes the tree and a file reader, so it runs the same against
 * GitHub or fixtures. The rules follow the useTrace CLI's adapters
 * (packages/usetrace/src/adapters) so both setups agree on what they detect.
 */

export type Framework =
  | 'nextjs'
  | 'react'
  | 'node'
  | 'react-native'
  | 'flutter'
  | 'swift'
  | 'android'
  | 'rust'
  | 'python'
  | 'php'
  | 'go'
  | 'ruby'
  | 'unknown';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Frameworks the setup PR can install today. Everything else falls back to the manual wizard. */
export const SUPPORTED_FRAMEWORKS: Framework[] = ['nextjs', 'react', 'node'];

export interface DetectedApp {
  /** Folder relative to the repository root; '' is the root. */
  folder: string;
  framework: Framework;
  /** For people: "Next.js (App Router)", "React (Vite)", "Express", "Flutter". */
  label: string;
  supported: boolean;
  packageManager: PackageManager | null;
  typescript: boolean;
  /** A TraceIQ SDK is already a dependency. */
  alreadyInstalled: boolean;
  details: {
    router?: 'app' | 'pages';
    srcDir?: boolean;
    bundler?: 'vite' | 'cra';
    /** The file the setup changes to mount or import TraceIQ (layout, _app, main, server entry). */
    entry?: string;
    moduleType?: 'esm' | 'cjs';
    server?: 'express' | 'nestjs' | 'fastify' | 'koa' | 'hono' | 'other';
  };
}

export type Detection =
  | { kind: 'app'; app: DetectedApp }
  | { kind: 'pick_folder'; candidates: DetectedApp[] };

export interface RepoSnapshot {
  /** Every file path in the repository (forward slashes, no leading slash). */
  paths: string[];
  /** A file's text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
}

const MANIFESTS = [
  'package.json',
  'pubspec.yaml',
  'Cargo.toml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
  'pyproject.toml',
  'requirements.txt',
  'composer.json',
  'go.mod',
  'Gemfile'
];
const IGNORED_SEGMENTS = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'Pods', 'coverage']);
const MAX_CANDIDATE_DEPTH = 3;
const MAX_CANDIDATES = 20;
const TRACEIQ_PACKAGES = ['traceiq-sdk-js', 'traceiq-node', 'traceiq-react-native'];

type PackageJson = {
  name?: string;
  type?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
  packageManager?: string;
};

export function joinPath(folder: string, file: string): string {
  return folder ? `${folder}/${file}` : file;
}

function parentFolder(folder: string): string | null {
  if (!folder) return null;
  const index = folder.lastIndexOf('/');
  return index === -1 ? '' : folder.slice(0, index);
}

export async function readJson<T>(snapshot: RepoSnapshot, path: string): Promise<T | null> {
  const text = await snapshot.read(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * The app to set up. A non-empty `subdirectory` (chosen by the person) is used as is.
 * Otherwise the root is used when it is an app; in a monorepo, a single app folder is
 * picked automatically and several are returned for the person to choose.
 */
export async function detectStack(snapshot: RepoSnapshot, subdirectory = ''): Promise<Detection> {
  const paths = new Set(snapshot.paths);
  if (subdirectory) return { kind: 'app', app: await detectFolder(snapshot, paths, subdirectory) };

  const root = await detectFolder(snapshot, paths, '');
  const rootPackage = await readJson<PackageJson>(snapshot, 'package.json');
  const workspaceRoot =
    Boolean(rootPackage?.workspaces) ||
    ['pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json', 'rush.json'].some((file) => paths.has(file));

  if (!workspaceRoot && root.framework !== 'unknown') return { kind: 'app', app: root };
  if (workspaceRoot && root.framework !== 'unknown' && root.framework !== 'node') return { kind: 'app', app: root };

  const candidates: DetectedApp[] = [];
  for (const folder of candidateFolders(snapshot.paths)) {
    const app = await detectFolder(snapshot, paths, folder);
    if (app.framework !== 'unknown') candidates.push(app);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length === 1) return { kind: 'app', app: candidates[0] };
  if (candidates.length > 1) {
    // Supported apps first, then by path, so the list reads the same every time.
    candidates.sort((a, b) => Number(b.supported) - Number(a.supported) || a.folder.localeCompare(b.folder));
    return { kind: 'pick_folder', candidates };
  }
  return { kind: 'app', app: root };
}

/** Folders (not the root) that hold a manifest, a few levels deep. */
function candidateFolders(paths: string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/');
    const file = segments.pop()!;
    if (!segments.length || segments.length > MAX_CANDIDATE_DEPTH) continue;
    if (segments.some((segment) => IGNORED_SEGMENTS.has(segment) || segment.startsWith('.'))) continue;
    if (MANIFESTS.includes(file)) folders.add(segments.join('/'));
  }
  return [...folders].sort();
}

export async function detectFolder(snapshot: RepoSnapshot, paths: Set<string>, folder: string): Promise<DetectedApp> {
  const has = (file: string) => paths.has(joinPath(folder, file));
  const firstExisting = (files: string[]) => files.find((file) => has(file));
  const base: DetectedApp = {
    folder,
    framework: 'unknown',
    label: 'Unknown',
    supported: false,
    packageManager: null,
    typescript: has('tsconfig.json'),
    alreadyInstalled: false,
    details: {}
  };

  const pkg = await readJson<PackageJson>(snapshot, joinPath(folder, 'package.json'));
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const app: DetectedApp = {
      ...base,
      packageManager: await detectPackageManager(snapshot, paths, folder),
      alreadyInstalled: TRACEIQ_PACKAGES.some((name) => name in deps)
    };

    if (deps['react-native'] || deps.expo) return { ...app, framework: 'react-native', label: deps.expo ? 'React Native (Expo)' : 'React Native' };

    if (deps.next || has('next.config.js') || has('next.config.mjs') || has('next.config.ts')) {
      const srcDir = paths.has(joinPath(folder, 'src/app/layout.tsx')) || [...paths].some((p) => p.startsWith(joinPath(folder, 'src/app/')) || p.startsWith(joinPath(folder, 'src/pages/')));
      const prefix = srcDir ? 'src/' : '';
      const layout = firstExisting(['tsx', 'jsx', 'js', 'ts'].map((ext) => `${prefix}app/layout.${ext}`));
      const appFile = firstExisting(['tsx', 'jsx', 'js', 'ts'].map((ext) => `${prefix}pages/_app.${ext}`));
      const router = layout ? 'app' : appFile || [...paths].some((p) => p.startsWith(joinPath(folder, `${prefix}pages/`))) ? 'pages' : undefined;
      const entry = layout ?? appFile;
      return {
        ...app,
        framework: 'nextjs',
        label: router === 'app' ? 'Next.js (App Router)' : router === 'pages' ? 'Next.js (Pages Router)' : 'Next.js',
        supported: Boolean(router),
        typescript: app.typescript || Boolean(entry?.match(/\.tsx?$/)),
        details: { router, srcDir, entry: entry ? joinPath(folder, entry) : undefined }
      };
    }

    if (deps.react) {
      const vite = Boolean(deps.vite) || has('vite.config.ts') || has('vite.config.js') || has('vite.config.mjs');
      const cra = Boolean(deps['react-scripts']);
      const entry = firstExisting(
        vite
          ? ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'src/index.tsx', 'src/index.jsx']
          : ['src/index.tsx', 'src/index.jsx', 'src/index.js', 'src/index.ts']
      );
      if (vite || cra) {
        return {
          ...app,
          framework: 'react',
          label: vite ? 'React (Vite)' : 'React (Create React App)',
          supported: Boolean(entry),
          typescript: app.typescript || Boolean(entry?.match(/\.tsx?$/)),
          details: { bundler: vite ? 'vite' : 'cra', entry: entry ? joinPath(folder, entry) : undefined }
        };
      }
      return { ...app, framework: 'react', label: 'React (unrecognised bundler)', supported: false };
    }

    const server = deps['@nestjs/core'] ? 'nestjs' : deps.express ? 'express' : deps.fastify ? 'fastify' : deps.koa ? 'koa' : deps.hono ? 'hono' : 'other';
    const entry = nodeEntry(pkg, has, server);
    const labels = { nestjs: 'NestJS', express: 'Express', fastify: 'Fastify', koa: 'Koa', hono: 'Hono', other: 'Node.js' } as const;
    return {
      ...app,
      framework: 'node',
      label: labels[server],
      supported: true,
      typescript: app.typescript || Boolean(deps.typescript) || Boolean(entry?.endsWith('.ts')),
      details: { server, moduleType: pkg.type === 'module' ? 'esm' : 'cjs', entry: entry ? joinPath(folder, entry) : undefined }
    };
  }

  if (has('pubspec.yaml')) return { ...base, framework: 'flutter', label: 'Flutter' };
  if (has('Package.swift') || [...paths].some((p) => p.startsWith(joinPath(folder, '')) && p.includes('.xcodeproj/'))) {
    return { ...base, framework: 'swift', label: 'Swift (iOS / macOS)' };
  }
  if (has('build.gradle') || has('build.gradle.kts') || has('settings.gradle') || has('settings.gradle.kts')) {
    return { ...base, framework: 'android', label: 'Android / Kotlin' };
  }
  if (has('Cargo.toml')) return { ...base, framework: 'rust', label: 'Rust' };
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) return { ...base, framework: 'python', label: 'Python' };
  if (has('composer.json')) return { ...base, framework: 'php', label: 'PHP' };
  if (has('go.mod')) return { ...base, framework: 'go', label: 'Go' };
  if (has('Gemfile')) return { ...base, framework: 'ruby', label: 'Ruby' };
  return base;
}

/** The file a Node server starts from: `main`, the start script, then common names. */
function nodeEntry(pkg: PackageJson, has: (file: string) => boolean, server: string): string | undefined {
  const fromScript = (script?: string) => {
    const match = script?.match(/(?:^|\s)(?:node|nodemon|ts-node|tsx|bun)\s+(?:--?\S+\s+)*([\w./-]+\.(?:[cm]?js|ts))/);
    return match?.[1]?.replace(/^\.\//, '');
  };
  const sourceFor = (built?: string) => {
    if (!built) return undefined;
    if (has(built)) return built;
    // "dist/main.js" built from "src/main.ts".
    const source = built.replace(/^(dist|build|out)\//, 'src/').replace(/\.[cm]?js$/, '.ts');
    return has(source) ? source : undefined;
  };
  const candidates = [
    sourceFor(fromScript(pkg.scripts?.dev)),
    sourceFor(fromScript(pkg.scripts?.start)),
    sourceFor(pkg.main?.replace(/^\.\//, '')),
    ...(server === 'nestjs' ? ['src/main.ts'] : []),
    'src/index.ts', 'src/server.ts', 'src/app.ts', 'src/main.ts',
    'index.js', 'server.js', 'app.js', 'src/index.js', 'src/server.js', 'src/app.js', 'index.mjs', 'server.mjs'
  ];
  return candidates.find((file) => file && has(file));
}

/** Lockfile in the folder or the nearest parent, then `packageManager` in package.json. Defaults to npm. */
async function detectPackageManager(snapshot: RepoSnapshot, paths: Set<string>, folder: string): Promise<PackageManager> {
  for (let current: string | null = folder; current !== null; current = parentFolder(current)) {
    const has = (file: string) => paths.has(joinPath(current!, file));
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('bun.lockb') || has('bun.lock')) return 'bun';
    if (has('yarn.lock')) return 'yarn';
    if (has('package-lock.json')) return 'npm';
    const pkg = await readJson<PackageJson>(snapshot, joinPath(current, 'package.json'));
    const declared = pkg?.packageManager?.split('@')[0];
    if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') return declared;
  }
  return 'npm';
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter } from './adapter.interface.js';
import { NextJsAdapter } from './nextjs.adapter.js';
import { ViteReactAdapter } from './vite-react.adapter.js';
import { NodeAdapter } from './node.adapter.js';
import { GenericWebAdapter } from './generic.adapter.js';

export async function detectPackageManager(cwd: string): Promise<'pnpm' | 'npm' | 'yarn' | 'bun'> {
  try {
    const files = await fs.readdir(cwd);
    if (files.includes('pnpm-lock.yaml')) return 'pnpm';
    if (files.includes('bun.lockb') || files.includes('bun.lock')) return 'bun';
    if (files.includes('yarn.lock')) return 'yarn';
    if (files.includes('package-lock.json')) return 'npm';
  } catch {
    // default to npm
  }
  return 'npm';
}

export async function getProjectMetadata(cwd: string): Promise<{
  projectName: string;
  version?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}> {
  try {
    const pkgRaw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    return {
      projectName: pkg.name ?? path.basename(cwd),
      version: pkg.version,
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {}
    };
  } catch {
    return {
      projectName: path.basename(cwd),
      dependencies: {},
      devDependencies: {}
    };
  }
}

export async function detectExistingEnvCredentials(cwd: string): Promise<{
  projectId?: string;
  writeKey?: string;
  apiUrl?: string;
  foundInFile?: string;
}> {
  const envFileCandidates = ['.env.local', '.env.development.local', '.env.development', '.env'];
  for (const file of envFileCandidates) {
    try {
      const content = await fs.readFile(path.join(cwd, file), 'utf8');
      const lines = content.split('\n');
      let projectId: string | undefined;
      let writeKey: string | undefined;
      let apiUrl: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim().replace(/^["']|["']$/g, '');

        if (
          key === 'NEXT_PUBLIC_TRACEIQ_PROJECT_ID' ||
          key === 'VITE_TRACEIQ_PROJECT_ID' ||
          key === 'PUBLIC_TRACEIQ_PROJECT_ID' ||
          key === 'TRACEIQ_PROJECT_ID'
        ) {
          projectId = val;
        }

        if (
          key === 'NEXT_PUBLIC_TRACEIQ_WRITE_KEY' ||
          key === 'VITE_TRACEIQ_WRITE_KEY' ||
          key === 'PUBLIC_TRACEIQ_WRITE_KEY' ||
          key === 'TRACEIQ_WRITE_KEY'
        ) {
          writeKey = val;
        }

        if (
          key === 'NEXT_PUBLIC_TRACEIQ_API_URL' ||
          key === 'VITE_TRACEIQ_API_URL' ||
          key === 'TRACEIQ_API_URL'
        ) {
          apiUrl = val;
        }
      }

      if (projectId || writeKey) {
        return { projectId, writeKey, apiUrl, foundInFile: file };
      }
    } catch {
      // Continue searching
    }
  }

  return {};
}

export function getAllAdapters(): FrameworkAdapter[] {
  return [
    new NextJsAdapter(),
    new ViteReactAdapter(),
    new NodeAdapter(),
    new GenericWebAdapter()
  ];
}

export async function resolveFrameworkAdapter(cwd: string): Promise<FrameworkAdapter> {
  const adapters = getAllAdapters();
  for (const adapter of adapters) {
    if (await adapter.detect(cwd)) {
      return adapter;
    }
  }
  return new GenericWebAdapter();
}

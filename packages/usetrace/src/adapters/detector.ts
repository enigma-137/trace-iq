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

/**
 * Resolves the appropriate env file according to repository convention:
 * if .env.local exists → use .env.local
 * else if .env exists → use .env
 * else if .env.development exists → use .env.development
 * else → create .env.local
 */
export async function resolveTargetEnvFile(cwd: string): Promise<string> {
  const candidates = ['.env.local', '.env', '.env.development'];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(cwd, candidate));
      return candidate;
    } catch {
      // does not exist
    }
  }
  return '.env.local';
}

/**
 * Resolves default TraceIQ API URL using precedence:
 * explicit --api-url → existing project env → https://api.traceiq.run
 */
export function resolveDefaultApiUrl(optionsApiUrl?: string, existingEnvApiUrl?: string): string {
  if (optionsApiUrl) return optionsApiUrl;
  if (existingEnvApiUrl) return existingEnvApiUrl;
  if (process.env.TRACEIQ_API_URL) return process.env.TRACEIQ_API_URL;
  if (process.env.NEXT_PUBLIC_TRACEIQ_API_URL) return process.env.NEXT_PUBLIC_TRACEIQ_API_URL;
  return 'https://api.traceiq.run';
}

/**
 * Applies or updates environment variables in the selected env file,
 * preserving existing variables, comments, and formatting.
 */
export async function applyEnvVariables(
  cwd: string,
  envFileName: string,
  vars: Record<string, string>,
  dryRun?: boolean
): Promise<{ created: boolean; modified: boolean; addedVars: string[] }> {
  const envPath = path.join(cwd, envFileName);
  let fileExists = false;
  let content = '';

  try {
    content = await fs.readFile(envPath, 'utf8');
    fileExists = true;
  } catch {
    fileExists = false;
  }

  const addedVars: string[] = [];

  if (!fileExists) {
    const lines = ['# TraceIQ Configuration'];
    for (const [key, val] of Object.entries(vars)) {
      lines.push(`${key}=${val}`);
      addedVars.push(key);
    }
    const newContent = lines.join('\n') + '\n';
    if (!dryRun) {
      await fs.writeFile(envPath, newContent, 'utf8');
    }
    return { created: true, modified: false, addedVars };
  }

  // Update existing file while preserving comments and non-TraceIQ variables
  const rawLines = content.split(/\r?\n/);
  const updatedLines: string[] = [];
  const handledKeys = new Set<string>();

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      updatedLines.push(line);
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (key in vars) {
      updatedLines.push(`${key}=${vars[key]}`);
      handledKeys.add(key);
      addedVars.push(key);
    } else {
      updatedLines.push(line);
    }
  }

  // Append any keys from vars that were not present in the existing file
  const unhandledKeys = Object.keys(vars).filter((k) => !handledKeys.has(k));
  if (unhandledKeys.length > 0) {
    // Ensure newline before appending header
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push('# TraceIQ Configuration');
    for (const key of unhandledKeys) {
      updatedLines.push(`${key}=${vars[key]}`);
      addedVars.push(key);
    }
  }

  const newContent = updatedLines.join('\n') + (content.endsWith('\n') || unhandledKeys.length > 0 ? '\n' : '');
  if (!dryRun) {
    await fs.writeFile(envPath, newContent, 'utf8');
  }

  return { created: false, modified: true, addedVars };
}

export async function detectExistingEnvCredentials(cwd: string): Promise<{
  projectId?: string;
  writeKey?: string;
  apiUrl?: string;
  foundInFile?: string;
}> {
  const envFileCandidates = ['.env.local', '.env', '.env.development', '.env.development.local'];
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

      if (projectId || writeKey || apiUrl) {
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

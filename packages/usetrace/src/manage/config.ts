import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_API_URL = 'https://api.traceiq.run';
export const DEFAULT_DASHBOARD_URL = 'https://traceiq.run';

/**
 * Saved CLI state. Lives in ~/.traceiq/config.json (override the directory
 * with TRACEIQ_CONFIG_DIR) and is written with owner-only permissions because
 * it holds a personal access token.
 */
export interface CliConfig {
  apiUrl?: string;
  dashboardUrl?: string;
  token?: string;
  projectId?: string;
  projectName?: string;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.TRACEIQ_CONFIG_DIR?.trim() || path.join(os.homedir(), '.traceiq');
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), 'config.json');
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(configPath(env), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CliConfig) : {};
  } catch {
    return {};
  }
}

export async function saveConfig(config: CliConfig, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await fs.mkdir(configDir(env), { recursive: true, mode: 0o700 });
  const file = configPath(env);
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  // writeFile only applies `mode` when creating the file.
  await fs.chmod(file, 0o600).catch(() => {});
}

export interface ResolvedContext {
  apiUrl: string;
  dashboardUrl: string;
  token?: string;
  tokenSource?: 'flag' | 'env' | 'config';
  projectId?: string;
  projectName?: string;
}

/**
 * Precedence: command-line flag → environment variable → saved config → default.
 */
export function resolveContext(
  flags: { apiUrl?: string; token?: string; project?: string; dashboardUrl?: string },
  config: CliConfig,
  env: NodeJS.ProcessEnv = process.env
): ResolvedContext {
  const apiUrl = stripTrailingSlash(flags.apiUrl || env.TRACEIQ_API_URL || config.apiUrl || DEFAULT_API_URL);

  let token: string | undefined;
  let tokenSource: ResolvedContext['tokenSource'];
  if (flags.token) {
    token = flags.token;
    tokenSource = 'flag';
  } else if (env.TRACEIQ_TOKEN) {
    token = env.TRACEIQ_TOKEN;
    tokenSource = 'env';
  } else if (config.token) {
    token = config.token;
    tokenSource = 'config';
  }

  const projectId = flags.project || env.TRACEIQ_PROJECT_ID?.trim() || config.projectId;

  return {
    apiUrl,
    dashboardUrl: stripTrailingSlash(
      flags.dashboardUrl || env.TRACEIQ_DASHBOARD_URL || config.dashboardUrl || deriveDashboardUrl(apiUrl)
    ),
    token,
    tokenSource,
    projectId,
    projectName: projectId && projectId === config.projectId ? config.projectName : undefined
  };
}

/**
 * Guesses the dashboard origin from the API URL: api.example.com → example.com,
 * and any localhost API → the dashboard dev server on port 3000.
 */
export function deriveDashboardUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return `${url.protocol}//${url.hostname}:3000`;
    }
    if (url.hostname.startsWith('api.')) {
      return `${url.protocol}//${url.hostname.slice(4)}`;
    }
  } catch {
    // fall through
  }
  return DEFAULT_DASHBOARD_URL;
}

export function maskToken(token: string): string {
  return token.length <= 16 ? `${token.slice(0, 4)}…` : `${token.slice(0, 16)}…`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/manage/args.js';
import { TraceIQApiClient } from '../src/manage/api-client.js';
import { deriveDashboardUrl, loadConfig, resolveContext, saveConfig } from '../src/manage/config.js';
import { buildEnvVars, ManageDeps, runManageCommand } from '../src/manage/commands.js';
import { formatLogLine, parseDuration, resolveSince } from '../src/manage/format.js';

const PROJECTS = [
  { id: 'proj_a', name: 'Alpha', slug: 'alpha', organizationId: 'org_1', organizationName: 'Acme', role: 'owner' },
  { id: 'proj_b', name: 'Beta', slug: 'beta', organizationId: 'org_1', organizationName: 'Acme', role: 'owner' }
];

function log(id: string, timestamp: string, message = `msg ${id}`) {
  return {
    id,
    projectId: 'proj_a',
    timestamp,
    level: 'info',
    source: 'sdk',
    service: null,
    message,
    status: null,
    statusCode: null,
    durationMs: null,
    method: null,
    route: null,
    traceId: null,
    requestId: null,
    distinctId: null,
    environment: null,
    metadata: null,
    errorDetails: null
  };
}

type Handler = (url: URL, headers: Record<string, string>) => { status?: number; body: unknown };

function fakeFetch(handler: Handler) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    const { status = 200, body } = handler(url, headers);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

describe('argument parsing', () => {
  it('handles positionals, values, booleans, aliases and = syntax', () => {
    const parsed = parseArgs(['use', 'proj_a', '--level', 'error', '-f', '--json', '-n', '10', '--since=15m']);
    expect(parsed.positionals).toEqual(['use', 'proj_a']);
    expect(parsed.flags).toEqual({ level: 'error', follow: true, json: true, limit: '10', since: '15m' });
  });

  it('does not swallow the next flag as a value', () => {
    expect(parseArgs(['--token', '--json']).flags).toEqual({ token: true, json: true });
  });
});

describe('formatting helpers', () => {
  it('parses relative windows', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('soon')).toBeUndefined();
  });

  it('resolves --since to an ISO date', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    expect(resolveSince('1h', now)).toBe('2026-01-01T11:00:00.000Z');
    expect(resolveSince('2026-01-01T00:00:00Z', now)).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveSince('garbage', now)).toBeUndefined();
  });

  it('renders a log line with request details', () => {
    const line = formatLogLine({ ...log('1', '2026-01-01T12:00:00.000Z', 'done'), method: 'GET', route: '/api/x', statusCode: 500, durationMs: 12.4 });
    expect(line).toContain('GET /api/x 500');
    expect(line).toContain('12ms');
    expect(line).toContain('done');
  });
});

describe('context resolution', () => {
  it('prefers flags over env over config', () => {
    const config = { apiUrl: 'http://config', token: 'tiq_pat_config', projectId: 'proj_config', projectName: 'Cfg' };
    expect(resolveContext({}, config, {})).toMatchObject({ apiUrl: 'http://config', token: 'tiq_pat_config', tokenSource: 'config', projectName: 'Cfg' });
    expect(resolveContext({}, config, { TRACEIQ_TOKEN: 'tiq_pat_env', TRACEIQ_API_URL: 'http://env/' })).toMatchObject({
      apiUrl: 'http://env',
      token: 'tiq_pat_env',
      tokenSource: 'env'
    });
    expect(resolveContext({ token: 'tiq_pat_flag', project: 'proj_flag' }, config, {})).toMatchObject({
      token: 'tiq_pat_flag',
      tokenSource: 'flag',
      projectId: 'proj_flag',
      projectName: undefined
    });
  });

  it('derives the dashboard origin from the API URL', () => {
    expect(deriveDashboardUrl('https://api.traceiq.run')).toBe('https://traceiq.run');
    expect(deriveDashboardUrl('http://localhost:4000')).toBe('http://localhost:3000');
    expect(deriveDashboardUrl('https://traceiq.internal')).toBe('https://traceiq.run');
  });
});

describe('API client', () => {
  it('sends the token and active project header', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { projects: PROJECTS } }));
    const client = new TraceIQApiClient({ apiUrl: 'http://api.test/prefix', token: 'tiq_pat_x', projectId: 'proj_a', fetchImpl: impl });
    await client.getLogs({ level: 'error', search: undefined });
    expect(calls[0].url.pathname).toBe('/prefix/v1/dashboard/logs');
    expect(calls[0].url.searchParams.get('projectId')).toBe('proj_a');
    expect(calls[0].url.searchParams.get('level')).toBe('error');
    expect(calls[0].url.searchParams.has('search')).toBe(false);
    expect(calls[0].headers.Authorization).toBe('Bearer tiq_pat_x');
    expect(calls[0].headers['x-traceiq-project-id']).toBe('proj_a');
  });

  it('turns a missing scope into a hint', async () => {
    const { impl } = fakeFetch(() => ({ status: 403, body: { message: 'Personal access token requires "analytics:read" scope.' } }));
    const client = new TraceIQApiClient({ apiUrl: 'http://api.test', token: 'tiq_pat_x', fetchImpl: impl });
    await expect(client.getOverview()).rejects.toMatchObject({ hint: expect.stringContaining('analytics:read') });
  });

  it('refuses to call authenticated endpoints without a token', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: {} }));
    const client = new TraceIQApiClient({ apiUrl: 'http://api.test', fetchImpl: impl });
    await expect(client.listProjects()).rejects.toThrow('Not logged in.');
    expect(calls).toHaveLength(0);
  });
});

describe('management commands', () => {
  let tempDir: string;
  let output: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const deps = (overrides: Partial<ManageDeps> = {}): ManageDeps => ({
    cwd: tempDir,
    env: { TRACEIQ_CONFIG_DIR: path.join(tempDir, '.traceiq') },
    out: (line = '') => output.push(line),
    sleep: async () => false,
    openUrl: async () => {},
    now: () => Date.parse('2026-01-01T12:00:00.000Z'),
    ...overrides
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'traceiq-manage-test-'));
    output = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '));
    });
    process.exitCode = undefined;
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('login --token validates the token and saves it with the only project', async () => {
    const { impl } = fakeFetch(() => ({ body: { projects: [PROJECTS[0]] } }));
    const d = deps({ fetchImpl: impl });
    await runManageCommand('login', ['--token', 'tiq_pat_abcdefghijklmnop', '--api-url', 'http://localhost:4000'], d);

    const config = await loadConfig(d.env);
    expect(config).toMatchObject({ token: 'tiq_pat_abcdefghijklmnop', apiUrl: 'http://localhost:4000', projectId: 'proj_a', projectName: 'Alpha' });
    expect(process.exitCode).toBeUndefined();
  });

  it('login rejects a token the API refuses and saves nothing', async () => {
    const { impl } = fakeFetch(() => ({ status: 401, body: { message: 'Invalid or expired personal access token.' } }));
    const d = deps({ fetchImpl: impl });
    await runManageCommand('login', ['--token', 'tiq_pat_bad'], d);
    expect(process.exitCode).toBe(1);
    expect(await loadConfig(d.env)).toEqual({});
  });

  it('projects use matches by slug and stores the choice', async () => {
    const d = deps();
    await saveConfig({ token: 'tiq_pat_x', projectId: 'proj_a' }, d.env);
    const { impl } = fakeFetch(() => ({ body: { projects: PROJECTS } }));
    await runManageCommand('projects', ['use', 'beta'], { ...d, fetchImpl: impl });
    expect(await loadConfig(d.env)).toMatchObject({ projectId: 'proj_b', projectName: 'Beta' });
  });

  it('projects create explains the dashboard-only restriction', async () => {
    const d = deps();
    await runManageCommand('projects', ['create', 'New'], d);
    expect(process.exitCode).toBe(1);
    expect(output.join('\n')).toContain('signed-in dashboard session');
  });

  it('logs prints oldest first and --follow only prints new entries', async () => {
    const d = deps();
    await saveConfig({ token: 'tiq_pat_x', projectId: 'proj_a' }, d.env);

    let call = 0;
    const { impl, calls } = fakeFetch(() => {
      call++;
      if (call === 1) {
        return { body: { project: { id: 'proj_a', name: 'Alpha' }, logs: [log('2', '2026-01-01T11:59:02.000Z'), log('1', '2026-01-01T11:59:01.000Z')], hasMore: false } };
      }
      // Poll: the API's `from` is inclusive, so log 2 comes back again.
      return { body: { project: { id: 'proj_a', name: 'Alpha' }, logs: [log('3', '2026-01-01T12:00:01.000Z'), log('2', '2026-01-01T11:59:02.000Z')], hasMore: false } };
    });

    let polls = 0;
    await runManageCommand('logs', ['--follow', '--json', '--level', 'error'], {
      ...d,
      fetchImpl: impl,
      sleep: async () => ++polls <= 1
    });

    const ids = output.map((line) => JSON.parse(line).id);
    expect(ids).toEqual(['1', '2', '3']);
    expect(calls[0].url.searchParams.get('level')).toBe('error');
    expect(calls[1].url.searchParams.get('from')).toBe('2026-01-01T11:59:02.000Z');
  });

  it('events fails loudly when the API falls back to a different project', async () => {
    const d = deps();
    await saveConfig({ token: 'tiq_pat_x', projectId: 'proj_missing' }, d.env);
    const { impl } = fakeFetch(() => ({ body: { project: PROJECTS[0], events: [] } }));
    await runManageCommand('events', [], { ...d, fetchImpl: impl });
    expect(process.exitCode).toBe(1);
    expect(output.join('\n')).toContain('not accessible');
  });

  it('env pull writes framework-prefixed vars and keeps the existing write key', async () => {
    const d = deps();
    await saveConfig({ token: 'tiq_pat_x', projectId: 'proj_a', apiUrl: 'http://localhost:4000' }, d.env);
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'app', dependencies: { next: '15.0.0' } }));
    await fs.writeFile(path.join(tempDir, '.env.local'), 'OTHER=1\nNEXT_PUBLIC_TRACEIQ_PROJECT_ID=proj_a\nNEXT_PUBLIC_TRACEIQ_WRITE_KEY=trq_secret\n');

    await runManageCommand('env', ['pull'], d);

    const content = await fs.readFile(path.join(tempDir, '.env.local'), 'utf8');
    expect(content).toContain('OTHER=1');
    expect(content).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=proj_a');
    expect(content).toContain('NEXT_PUBLIC_TRACEIQ_API_URL=http://localhost:4000');
    expect(content).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=trq_secret');
  });

  it('buildEnvVars omits the write key when unknown', () => {
    expect(buildEnvVars('VITE_', { projectId: 'p', apiUrl: 'u' })).toEqual({ VITE_TRACEIQ_PROJECT_ID: 'p', VITE_TRACEIQ_API_URL: 'u' });
  });

  it('open --print prints the dashboard URL for a page', async () => {
    const d = deps();
    await saveConfig({ apiUrl: 'https://api.traceiq.run' }, d.env);
    await runManageCommand('open', ['logs', '--print'], d);
    expect(output).toEqual(['https://traceiq.run/dashboard/logs']);
  });

  it('status reports a down API with exit code 1', async () => {
    const d = deps({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch
    });
    await runManageCommand('status', ['--json'], d);
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(output[0])).toMatchObject({ api: 'down' });
  });
});

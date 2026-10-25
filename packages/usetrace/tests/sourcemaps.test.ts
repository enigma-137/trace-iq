import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageDeps, runManageCommand } from '../src/manage/commands.js';

const MAP = JSON.stringify({ version: 3, sources: ['src/App.tsx'], names: [], mappings: 'AAAA' });

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: Buffer;
}

function fakeFetch(respond: (call: Call) => { status?: number; body: unknown } = () => ({ body: {} })) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? Buffer.from(init.body as Uint8Array) : undefined
    };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

describe('traceiq sourcemaps', () => {
  let tempDir: string;
  let output: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const deps = (overrides: Partial<ManageDeps> = {}): ManageDeps => ({
    cwd: tempDir,
    env: { TRACEIQ_CONFIG_DIR: path.join(tempDir, '.traceiq'), TRACEIQ_TOKEN: 'tiq_pat_ci', TRACEIQ_PROJECT_ID: 'proj_a' },
    out: (line = '') => output.push(line),
    sleep: async () => false,
    openUrl: async () => {},
    now: () => Date.parse('2026-01-01T12:00:00.000Z'),
    ...overrides
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'traceiq-sourcemaps-test-'));
    output = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '));
    });
    process.exitCode = undefined;

    await fs.mkdir(path.join(tempDir, 'dist/assets'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'dist/node_modules/x'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'dist/assets/index-3f2a.js'), 'console.log(1)');
    await fs.writeFile(path.join(tempDir, 'dist/assets/index-3f2a.js.map'), MAP);
    await fs.writeFile(path.join(tempDir, 'dist/vendor.mjs.map'), MAP);
    await fs.writeFile(path.join(tempDir, 'dist/styles.css.map'), MAP);
    await fs.writeFile(path.join(tempDir, 'dist/node_modules/x/x.js.map'), MAP);
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('uploads every JS map gzipped, keyed by the path of the file next to it', async () => {
    const { impl, calls } = fakeFetch(({ url }) => ({ body: { release: '1.4.2', map: { file: url.searchParams.get('file'), sizeBytes: MAP.length } } }));

    await runManageCommand('sourcemaps', ['upload', '--release', '1.4.2', '--delete-after'], deps({ fetchImpl: impl }));

    expect(process.exitCode).toBeUndefined();
    const files = calls.map((call) => call.url.searchParams.get('file')).sort();
    expect(files).toEqual(['assets/index-3f2a.js', 'vendor.mjs']);
    for (const call of calls) {
      expect(call.method).toBe('PUT');
      expect(call.url.pathname).toBe('/v1/sourcemaps');
      expect(call.url.searchParams.get('release')).toBe('1.4.2');
      expect(call.url.searchParams.get('projectId')).toBe('proj_a');
      expect(call.headers).toMatchObject({ Authorization: 'Bearer tiq_pat_ci', 'Content-Encoding': 'gzip' });
      expect(gunzipSync(call.body as Buffer).toString()).toBe(MAP);
    }
    // --delete-after removes the uploaded maps but leaves the bundle and other files.
    await expect(fs.stat(path.join(tempDir, 'dist/assets/index-3f2a.js.map'))).rejects.toThrow();
    await expect(fs.stat(path.join(tempDir, 'dist/assets/index-3f2a.js'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(tempDir, 'dist/styles.css.map'))).resolves.toBeTruthy();
    expect(output.join('\n')).toContain('Uploaded 2 source maps');
  });

  it('needs a release and a project, and --dry-run uploads nothing', async () => {
    const { impl, calls } = fakeFetch();

    await runManageCommand('sourcemaps', ['upload'], deps({ fetchImpl: impl }));
    expect(process.exitCode).toBe(1);
    expect(output.join('\n')).toContain('A release is required');

    process.exitCode = undefined;
    await runManageCommand('sourcemaps', ['upload', '--release', '1'], deps({ fetchImpl: impl, env: { TRACEIQ_CONFIG_DIR: path.join(tempDir, '.traceiq'), TRACEIQ_TOKEN: 'tiq_pat_ci' } }));
    expect(process.exitCode).toBe(1);
    expect(output.join('\n')).toContain('No project selected');

    process.exitCode = undefined;
    output = [];
    await runManageCommand('sourcemaps', ['upload', '--release', '1', '--dry-run', '--dir', 'dist'], deps({ fetchImpl: impl }));
    expect(process.exitCode).toBeUndefined();
    expect(output.join('\n')).toContain('assets/index-3f2a.js');
    expect(calls).toHaveLength(0);
  });

  it('reports files the API rejects and exits 1', async () => {
    const { impl } = fakeFetch(({ url }) =>
      url.searchParams.get('file') === 'vendor.mjs'
        ? { status: 400, body: { message: 'Not a valid source map: bad' } }
        : { body: { release: '1', map: { file: 'assets/index-3f2a.js', sizeBytes: 1 } } }
    );

    await runManageCommand('sourcemaps', ['upload', '--release', '1', '--delete-after'], deps({ fetchImpl: impl }));

    expect(process.exitCode).toBe(1);
    expect(output.join('\n')).toContain('vendor.mjs: API request failed (400): Not a valid source map: bad');
    // Nothing is deleted when an upload failed.
    await expect(fs.stat(path.join(tempDir, 'dist/assets/index-3f2a.js.map'))).resolves.toBeTruthy();
  });

  it('lists releases', async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: { project: { id: 'proj_a', name: 'Alpha' }, releases: [{ release: '1.4.2', maps: 2, sizeBytes: 2048, updatedAt: '2026-01-01T11:00:00.000Z' }] }
    }));

    await runManageCommand('sourcemaps', ['list'], deps({ fetchImpl: impl }));

    expect(calls[0].url.pathname).toBe('/v1/sourcemaps');
    expect(output.join('\n')).toContain('1.4.2');
    expect(output.join('\n')).toContain('2.0 KB');
  });
});

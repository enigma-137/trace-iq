import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextJsAdapter } from '../src/adapters/nextjs.adapter.js';
import { NodeAdapter, nodeClientModule } from '../src/adapters/node.adapter.js';
import { SDK_PACKAGES, relativeImport } from '../src/adapters/sdk-packages.js';
import { ViteReactAdapter } from '../src/adapters/vite-react.adapter.js';

const manifest = (pkg: string) => JSON.parse(readFileSync(new URL(`../../${pkg}/package.json`, import.meta.url), 'utf8')) as { name: string; version: string };

function parses(fileName: string, source: string): boolean {
  const result = ts.transpileModule(source, { fileName, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true } });
  return (result.diagnostics ?? []).length === 0;
}

const options = (cwd: string) => ({
  cwd,
  projectId: 'prj_test_123',
  writeKey: 'tiq_live_abc456',
  apiUrl: 'https://api.traceiq.run',
  selectedProducts: ['product-analytics', 'web-analytics', 'error-tracking'] as never,
  packageManager: 'npm' as const
});

/** A resolvable stub so ensurePackageInstalled does not run a real package manager. */
async function stubPackage(cwd: string, name: string, files: Record<string, string> = {}) {
  const dir = path.join(cwd, 'node_modules', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }));
  for (const [file, content] of Object.entries(files)) await fs.writeFile(path.join(dir, file), content);
}

describe('SDK packages', () => {
  it('match the published SDK manifests', () => {
    const browser = manifest('sdk-js');
    const node = manifest('node');
    expect(SDK_PACKAGES.browser).toEqual({ name: browser.name, range: `^${browser.version}` });
    expect(SDK_PACKAGES.node).toEqual({ name: node.name, range: `^${node.version}` });
  });

  it('builds relative imports, never an alias', () => {
    expect(relativeImport('/p/app/layout.tsx', '/p/components/traceiq-provider.tsx')).toBe('../components/traceiq-provider');
    expect(relativeImport('/p/src/app/layout.tsx', '/p/src/components/traceiq-provider.tsx')).toBe('../components/traceiq-provider');
    expect(relativeImport('/p/pages/_app.jsx', '/p/components/traceiq-provider.jsx')).toBe('../components/traceiq-provider');
    expect(relativeImport('/p/src/main.tsx', '/p/src/traceiq.ts')).toBe('./traceiq');
  });
});

describe('adapters install the right SDK', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'usetrace-sdk-test-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('Next.js: current browser SDK range and a relative provider import', async () => {
    await stubPackage(cwd, 'traceiq-sdk-js');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'web', dependencies: { next: '14', react: '18' } }));
    await fs.mkdir(path.join(cwd, 'app'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'app', 'layout.tsx'), 'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}\n');

    await new NextJsAdapter().install(options(cwd));

    const layout = await fs.readFile(path.join(cwd, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("import { TraceIQProvider } from '../components/traceiq-provider';");
    expect(layout).not.toContain('@/components');
    expect(parses('layout.tsx', layout)).toBe(true);
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
    expect(pkg.dependencies['traceiq-sdk-js']).toBe(SDK_PACKAGES.browser.range);
  });

  it('Next.js with src/: the import still resolves', async () => {
    await stubPackage(cwd, 'traceiq-sdk-js');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'web', dependencies: { next: '14', react: '18' } }));
    await fs.mkdir(path.join(cwd, 'src', 'app'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'src', 'app', 'layout.tsx'), 'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}\n');
    await new NextJsAdapter().install(options(cwd));
    const layout = await fs.readFile(path.join(cwd, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("from '../components/traceiq-provider'");
    await expect(fs.stat(path.join(cwd, 'src', 'components', 'traceiq-provider.tsx'))).resolves.toBeTruthy();
  });

  it('Vite: current browser SDK range', async () => {
    await stubPackage(cwd, 'traceiq-sdk-js');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'spa', dependencies: { react: '18' }, devDependencies: { vite: '5' } }));
    await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'src', 'main.tsx'), "import App from './App';\n");
    await new ViteReactAdapter().install(options(cwd));
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
    expect(pkg.dependencies['traceiq-sdk-js']).toBe(SDK_PACKAGES.browser.range);
  });

  it('Node (CommonJS): installs traceiq-node, not the browser SDK, with a require-based module', async () => {
    await stubPackage(cwd, 'traceiq-node');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api', dependencies: { express: '4' } }));

    const changes = await new NodeAdapter().install(options(cwd));

    expect(changes.createdFiles).toContain('traceiq.js');
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
    expect(pkg.dependencies['traceiq-node']).toBe(SDK_PACKAGES.node.range);
    expect(pkg.dependencies['traceiq-sdk-js']).toBeUndefined();
    const module = await fs.readFile(path.join(cwd, 'traceiq.js'), 'utf8');
    expect(module).toContain("const { TraceIQ } = require('traceiq-node');");
    expect(module).toContain('module.exports = { traceiq };');
    expect(module).not.toContain('traceiq.initialize');
    expect(module).not.toContain('tiq_live_abc456');
    // The real key goes to the local env file only.
    expect(await fs.readFile(path.join(cwd, '.env.local'), 'utf8')).toContain('TRACEIQ_WRITE_KEY=tiq_live_abc456');
  });

  it('Node: the generated module runs, and is null instead of throwing when unconfigured', async () => {
    await stubPackage(cwd, 'traceiq-node', {
      'index.js': `class TraceIQ { constructor(o) { if (!o.writeKey) throw new Error('writeKey is required'); this.options = o; } }\nmodule.exports = { TraceIQ };\n`
    });
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api' }));
    await new NodeAdapter().install(options(cwd));
    const load = () => {
      const require = createRequire(path.join(cwd, 'index.js'));
      delete require.cache[require.resolve('./traceiq.js')];
      return require('./traceiq.js') as { traceiq: { options: Record<string, string> } | null };
    };

    const saved = { ...process.env };
    try {
      delete process.env.TRACEIQ_PROJECT_ID;
      delete process.env.TRACEIQ_WRITE_KEY;
      expect(load().traceiq).toBeNull();

      process.env.TRACEIQ_PROJECT_ID = 'prj_1';
      process.env.TRACEIQ_WRITE_KEY = 'key_1';
      process.env.TRACEIQ_API_URL = 'https://self-hosted.test';
      expect(load().traceiq?.options).toEqual({ projectId: 'prj_1', writeKey: 'key_1', endpoint: 'https://self-hosted.test' });

      // The install prompt's older name still works.
      delete process.env.TRACEIQ_API_URL;
      process.env.TRACEIQ_ENDPOINT = 'https://endpoint.test';
      expect(load().traceiq?.options.endpoint).toBe('https://endpoint.test');
    } finally {
      process.env = saved;
    }
  });

  it('Node (ESM and TypeScript): import/export module that parses', async () => {
    await stubPackage(cwd, 'traceiq-node');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api', type: 'module' }));
    await new NodeAdapter().install(options(cwd));
    const esm = await fs.readFile(path.join(cwd, 'traceiq.js'), 'utf8');
    expect(esm).toContain("import { TraceIQ } from 'traceiq-node';");
    expect(esm).toContain('export const traceiq =');
    expect(esm).not.toContain('require(');

    expect(parses('traceiq.ts', nodeClientModule(true))).toBe(true);
    expect(parses('traceiq.js', nodeClientModule(false))).toBe(true);
  });

  it('Node inspect looks for traceiq-node and flags the browser SDK on a server', async () => {
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api', dependencies: { 'traceiq-sdk-js': '^0.1.7' } }));
    const wrong = await new NodeAdapter().inspect(cwd);
    expect(wrong.sdkDetected).toBe(false);
    expect(wrong.recommendations.join(' ')).toContain('Use traceiq-node on the server');

    await stubPackage(cwd, 'traceiq-node');
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api', dependencies: { 'traceiq-node': '^0.3.0' } }));
    const right = await new NodeAdapter().inspect(cwd);
    expect(right.sdkDetected).toBe(true);
    expect(right.sdkVersion).toBe('^0.3.0');
    expect(right.recommendations).toEqual([]);
  });
});

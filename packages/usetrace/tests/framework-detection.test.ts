import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, resolveFrameworkAdapter } from '../src/adapters/detector.js';
import { NextJsAdapter } from '../src/adapters/nextjs.adapter.js';
import { ViteReactAdapter } from '../src/adapters/vite-react.adapter.js';

describe('useTrace Framework and Environment Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usetrace-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('detects pnpm package manager from pnpm-lock.yaml', async () => {
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '');
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');
  });

  it('detects bun package manager from bun.lockb', async () => {
    await fs.writeFile(path.join(tempDir, 'bun.lockb'), '');
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');
  });

  it('detects Next.js project with App Router', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'my-next-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } })
    );
    await fs.mkdir(path.join(tempDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'app', 'layout.tsx'), 'export default function RootLayout({children}) { return <html><body>{children}</body></html>; }');

    const adapter = await resolveFrameworkAdapter(tempDir);
    expect(adapter).toBeInstanceOf(NextJsAdapter);

    const state = await adapter.inspect(tempDir);
    expect(state.framework).toBe('Next.js (App Router)');
    expect(state.sdkDetected).toBe(false);
    expect(state.providerConfigured).toBe(false);
  });

  it('detects Vite React project', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'my-vite-app', dependencies: { react: '^18.0.0' }, devDependencies: { vite: '^5.0.0' } })
    );
    await fs.writeFile(path.join(tempDir, 'vite.config.ts'), 'export default {}');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'main.tsx'), 'console.log("app")');

    const adapter = await resolveFrameworkAdapter(tempDir);
    expect(adapter).toBeInstanceOf(ViteReactAdapter);

    const state = await adapter.inspect(tempDir);
    expect(state.framework).toBe('React (Vite)');
  });
});

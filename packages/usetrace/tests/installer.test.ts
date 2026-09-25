import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { NextJsAdapter } from '../src/adapters/nextjs.adapter.js';
import { TraceIQInstaller } from '../src/installer/installer.js';

describe('useTrace Installer and Idempotency', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usetrace-installer-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('performs fresh installation creating provider and updating layout', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } }, null, 2)
    );
    await fs.mkdir(path.join(tempDir, 'app'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}'
    );

    const adapter = new NextJsAdapter();
    const installer = new TraceIQInstaller(adapter);

    const changes = await installer.install({
      cwd: tempDir,
      projectId: 'prj_test_123',
      writeKey: 'tiq_live_abc456',
      apiUrl: 'http://localhost:4000',
      selectedProducts: ['product-analytics', 'web-analytics', 'error-tracking', 'web-vitals'],
      packageManager: 'pnpm'
    });

    expect(changes.createdFiles).toContain('lib/traceiq.ts');
    expect(changes.createdFiles).toContain('components/traceiq-provider.tsx');
    expect(changes.modifiedFiles).toContain('app/layout.tsx');
    expect(changes.createdFiles).toContain('.env.local');

    // Verify layout content has provider
    const layoutAfter = await fs.readFile(path.join(tempDir, 'app', 'layout.tsx'), 'utf8');
    expect(layoutAfter).toContain('import { TraceIQProvider } from');
    expect(layoutAfter).toContain('<TraceIQProvider>{children}</TraceIQProvider>');

    // Verify .env.local
    const envAfter = await fs.readFile(path.join(tempDir, '.env.local'), 'utf8');
    expect(envAfter).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=prj_test_123');
    expect(envAfter).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=tiq_live_abc456');

    // Verify package.json
    const pkgAfter = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8'));
    expect(pkgAfter.dependencies['traceiq-sdk-js']).toBeDefined();

    // Rerunning installation should be safe and NOT duplicate provider
    const secondChanges = await installer.install({
      cwd: tempDir,
      projectId: 'prj_test_123',
      writeKey: 'tiq_live_abc456',
      apiUrl: 'http://localhost:4000',
      selectedProducts: ['product-analytics', 'web-analytics', 'error-tracking', 'web-vitals'],
      packageManager: 'pnpm'
    });

    const layoutSecondTime = await fs.readFile(path.join(tempDir, 'app', 'layout.tsx'), 'utf8');
    const matches = layoutSecondTime.match(/TraceIQProvider/g);
    expect(matches?.length).toBe(3); // 1 for import + 1 for opening tag + 1 for closing tag
    expect(secondChanges.createdFiles).toHaveLength(0); // No duplicate files created
  });

  it('generates a setup report without leaking secrets', async () => {
    const adapter = new NextJsAdapter();
    const installer = new TraceIQInstaller(adapter);

    const state = {
      projectName: 'my-app',
      framework: 'Next.js (App Router)',
      packageManager: 'pnpm' as const,
      sdkDetected: true,
      sdkVersion: '0.1.7',
      providerConfigured: true,
      projectKeyConfigured: true,
      pageViewsConfigured: true,
      userIdentificationConfigured: false,
      errorTrackingConfigured: true,
      webVitalsConfigured: true,
      featureFlagsConfigured: false,
      envFiles: ['.env.local'],
      issues: [],
      recommendations: []
    };

    const changes = {
      createdFiles: ['lib/traceiq.ts', 'components/traceiq-provider.tsx'],
      modifiedFiles: ['app/layout.tsx'],
      addedEnvVars: ['NEXT_PUBLIC_TRACEIQ_PROJECT_ID', 'NEXT_PUBLIC_TRACEIQ_WRITE_KEY'],
      installedPackages: ['traceiq-sdk-js'],
      diffs: []
    };

    const report = installer.createReport(
      state,
      changes,
      ['product-analytics', 'error-tracking'],
      'verified',
      { name: 'traceiq_setup_verified', timestamp: '12:00:00 PM', source: 'localhost:3000' }
    );

    const reportString = JSON.stringify(report);
    expect(reportString).not.toContain('tiq_live_');
    expect(reportString).not.toContain('secret');
    expect(report.verificationStatus).toBe('verified');
    expect(report.firstVerifiedEvent?.name).toBe('traceiq_setup_verified');
  });
});

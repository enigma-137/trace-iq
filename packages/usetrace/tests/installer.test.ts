import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { NextJsAdapter } from '../src/adapters/nextjs.adapter.js';
import { TraceIQInstaller } from '../src/installer/installer.js';
import { detectExistingEnvCredentials, resolveDefaultApiUrl } from '../src/adapters/detector.js';

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

  describe('Environment file convention & API URL precedence', () => {
    it('creates .env.local when no env file exists', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );

      const adapter = new NextJsAdapter();
      const installer = new TraceIQInstaller(adapter);
      const changes = await installer.install({
        cwd: tempDir,
        projectId: 'prj_test_1',
        writeKey: 'tiq_live_key1',
        apiUrl: 'https://api.traceiq.run',
        selectedProducts: ['product-analytics'],
        packageManager: 'npm'
      });

      expect(changes.createdFiles).toContain('.env.local');
      expect(changes.modifiedFiles).not.toContain('.env.local');
      const content = await fs.readFile(path.join(tempDir, '.env.local'), 'utf8');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=prj_test_1');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=tiq_live_key1');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_API_URL=https://api.traceiq.run');
    });

    it('respects existing .env file and preserves existing variables', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );
      await fs.writeFile(
        path.join(tempDir, '.env'),
        '# App Config\nDATABASE_URL=postgres://localhost:5432/mydb\nPORT=3000\n'
      );

      const adapter = new NextJsAdapter();
      const installer = new TraceIQInstaller(adapter);
      const changes = await installer.install({
        cwd: tempDir,
        projectId: 'prj_env_test',
        writeKey: 'tiq_live_env_key',
        apiUrl: 'https://api.traceiq.run',
        selectedProducts: ['product-analytics'],
        packageManager: 'npm'
      });

      expect(changes.modifiedFiles).toContain('.env');
      expect(changes.createdFiles).not.toContain('.env');
      expect(changes.createdFiles).not.toContain('.env.local');

      const content = await fs.readFile(path.join(tempDir, '.env'), 'utf8');
      expect(content).toContain('DATABASE_URL=postgres://localhost:5432/mydb');
      expect(content).toContain('PORT=3000');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=prj_env_test');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=tiq_live_env_key');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_API_URL=https://api.traceiq.run');

      const report = installer.createReport(
        {
          projectName: 'my-app',
          framework: 'Next.js',
          packageManager: 'npm',
          sdkDetected: true,
          providerConfigured: true,
          projectKeyConfigured: true,
          pageViewsConfigured: true,
          userIdentificationConfigured: false,
          errorTrackingConfigured: false,
          webVitalsConfigured: false,
          featureFlagsConfigured: false,
          envFiles: ['.env'],
          issues: [],
          recommendations: []
        },
        changes,
        ['product-analytics'],
        'verified'
      );
      expect(report.filesChanged).toContain('.env');
    });

    it('respects existing .env.local file and updates existing TraceIQ variables without duplicating', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );
      await fs.writeFile(
        path.join(tempDir, '.env.local'),
        '# Custom settings\nAUTH_SECRET=supersecret\nNEXT_PUBLIC_TRACEIQ_PROJECT_ID=old_proj\n'
      );

      const adapter = new NextJsAdapter();
      const installer = new TraceIQInstaller(adapter);
      const changes = await installer.install({
        cwd: tempDir,
        projectId: 'prj_updated_proj',
        writeKey: 'tiq_live_new_key',
        apiUrl: 'https://api.traceiq.run',
        selectedProducts: ['product-analytics'],
        packageManager: 'npm'
      });

      expect(changes.modifiedFiles).toContain('.env.local');
      const content = await fs.readFile(path.join(tempDir, '.env.local'), 'utf8');
      expect(content).toContain('AUTH_SECRET=supersecret');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=prj_updated_proj');
      expect(content).not.toContain('old_proj');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=tiq_live_new_key');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_API_URL=https://api.traceiq.run');
    });

    it('respects existing .env.development file when .env.local and .env do not exist', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-app', dependencies: { next: '^14.0.0', react: '^18.0.0' } })
      );
      await fs.writeFile(
        path.join(tempDir, '.env.development'),
        'NODE_ENV=development\nAPI_HOST=127.0.0.1\n'
      );

      const adapter = new NextJsAdapter();
      const installer = new TraceIQInstaller(adapter);
      const changes = await installer.install({
        cwd: tempDir,
        projectId: 'prj_dev_proj',
        writeKey: 'tiq_live_dev_key',
        apiUrl: 'https://api.traceiq.run',
        selectedProducts: ['product-analytics'],
        packageManager: 'npm'
      });

      expect(changes.modifiedFiles).toContain('.env.development');
      expect(changes.createdFiles).not.toContain('.env.local');
      const content = await fs.readFile(path.join(tempDir, '.env.development'), 'utf8');
      expect(content).toContain('API_HOST=127.0.0.1');
      expect(content).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=prj_dev_proj');
    });

    it('defaults to https://api.traceiq.run when no custom url or env is present', () => {
      const resolved = resolveDefaultApiUrl(undefined, undefined);
      expect(resolved).toBe('https://api.traceiq.run');
    });

    it('preserves and uses existing custom TraceIQ API URL from project env', async () => {
      await fs.writeFile(
        path.join(tempDir, '.env'),
        'NEXT_PUBLIC_TRACEIQ_API_URL=https://custom-proxy.internal.io\n'
      );

      const existing = await detectExistingEnvCredentials(tempDir);
      expect(existing.apiUrl).toBe('https://custom-proxy.internal.io');

      const resolved = resolveDefaultApiUrl(undefined, existing.apiUrl);
      expect(resolved).toBe('https://custom-proxy.internal.io');
    });

    it('explicit --api-url overrides both existing env and default production URL', () => {
      const explicitLocal = 'http://localhost:4000';
      const existingInEnv = 'https://custom-proxy.internal.io';

      const resolved = resolveDefaultApiUrl(explicitLocal, existingInEnv);
      expect(resolved).toBe('http://localhost:4000');
    });
  });
});

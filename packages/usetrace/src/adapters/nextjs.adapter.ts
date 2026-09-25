import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter, InstallOptions } from './adapter.interface.js';
import { SetupChanges, SetupState } from '../types.js';
import {
  applyEnvVariables,
  detectExistingEnvCredentials,
  detectPackageManager,
  getProjectMetadata,
  resolveTargetEnvFile
} from './detector.js';

export class NextJsAdapter implements FrameworkAdapter {
  readonly name = 'Next.js';
  readonly frameworkId = 'nextjs';

  async detect(cwd: string): Promise<boolean> {
    const meta = await getProjectMetadata(cwd);
    if (meta.dependencies['next'] || meta.devDependencies['next']) {
      return true;
    }

    try {
      const files = await fs.readdir(cwd);
      if (files.includes('next.config.js') || files.includes('next.config.mjs') || files.includes('next.config.ts')) {
        return true;
      }
    } catch {
      // not next
    }
    return false;
  }

  async inspect(cwd: string): Promise<SetupState> {
    const meta = await getProjectMetadata(cwd);
    const pm = await detectPackageManager(cwd);
    const envCreds = await detectExistingEnvCredentials(cwd);

    const sdkDetected = Boolean(meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js']);
    const sdkVersion = meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js'];

    const hasSrc = await this.directoryExists(path.join(cwd, 'src'));
    const baseDir = hasSrc ? path.join(cwd, 'src') : cwd;

    const hasAppRouter =
      (await this.fileExists(path.join(baseDir, 'app', 'layout.tsx'))) ||
      (await this.fileExists(path.join(baseDir, 'app', 'layout.jsx'))) ||
      (await this.fileExists(path.join(baseDir, 'app', 'layout.js')));

    const hasPagesRouter =
      (await this.fileExists(path.join(baseDir, 'pages', '_app.tsx'))) ||
      (await this.fileExists(path.join(baseDir, 'pages', '_app.jsx'))) ||
      (await this.fileExists(path.join(baseDir, 'pages', '_app.js')));

    // Check if provider file exists
    const hasProviderFile =
      (await this.fileExists(path.join(baseDir, 'components', 'traceiq-provider.tsx'))) ||
      (await this.fileExists(path.join(baseDir, 'components', 'traceiq-provider.jsx'))) ||
      (await this.fileExists(path.join(baseDir, 'components', 'TraceIQProvider.tsx')));

    // Check layout/app file for provider usage
    let layoutContent = '';
    let providerInLayout = false;
    let pageViewsConfigured = false;
    let errorTrackingConfigured = false;
    let webVitalsConfigured = false;
    let userIdentificationConfigured = false;
    let featureFlagsConfigured = false;

    if (hasAppRouter) {
      const layoutPath = (await this.findFirstExisting([
        path.join(baseDir, 'app', 'layout.tsx'),
        path.join(baseDir, 'app', 'layout.jsx'),
        path.join(baseDir, 'app', 'layout.js')
      ]))!;
      if (layoutPath) {
        layoutContent = await fs.readFile(layoutPath, 'utf8');
      }
    } else if (hasPagesRouter) {
      const appPath = (await this.findFirstExisting([
        path.join(baseDir, 'pages', '_app.tsx'),
        path.join(baseDir, 'pages', '_app.jsx'),
        path.join(baseDir, 'pages', '_app.js')
      ]))!;
      if (appPath) {
        layoutContent = await fs.readFile(appPath, 'utf8');
      }
    }

    if (layoutContent.includes('TraceIQProvider') || layoutContent.includes('traceiq.initialize') || hasProviderFile) {
      providerInLayout = true;
      pageViewsConfigured = true;
    }

    // Inspect provider implementation if present
    if (hasProviderFile) {
      try {
        const providerPath = (await this.findFirstExisting([
          path.join(baseDir, 'components', 'traceiq-provider.tsx'),
          path.join(baseDir, 'components', 'traceiq-provider.jsx'),
          path.join(baseDir, 'components', 'TraceIQProvider.tsx')
        ]))!;
        const providerContent = await fs.readFile(providerPath, 'utf8');
        if (providerContent.includes('autoCaptureExceptions') || providerContent.includes('errorTracking')) {
          errorTrackingConfigured = true;
        }
        if (providerContent.includes('autoCaptureWebVitals') || providerContent.includes('webVitals')) {
          webVitalsConfigured = true;
        }
        if (providerContent.includes('identify') || providerContent.includes('userIdentification')) {
          userIdentificationConfigured = true;
        }
        if (providerContent.includes('flags') || providerContent.includes('featureFlags')) {
          featureFlagsConfigured = true;
        }
      } catch {
        // ignore
      }
    }

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!sdkDetected) issues.push('TraceIQ SDK is not installed in dependencies.');
    if (!providerInLayout) issues.push('TraceIQ provider is not configured in root layout.');
    if (!envCreds.projectId || !envCreds.writeKey) issues.push('TraceIQ environment variables are missing.');
    if (sdkDetected && !userIdentificationConfigured) {
      recommendations.push('User identification is missing. Identify users after sign-in for unified user profiles.');
    }
    if (sdkDetected && !errorTrackingConfigured) {
      recommendations.push('Error tracking is not enabled. Turn on autoCaptureExceptions to track unhandled errors.');
    }

    return {
      projectName: meta.projectName,
      framework: hasAppRouter ? 'Next.js (App Router)' : hasPagesRouter ? 'Next.js (Pages Router)' : 'Next.js',
      packageManager: pm,
      sdkDetected,
      sdkVersion,
      providerConfigured: providerInLayout,
      projectKeyConfigured: Boolean(envCreds.projectId && envCreds.writeKey),
      pageViewsConfigured,
      userIdentificationConfigured,
      errorTrackingConfigured,
      webVitalsConfigured,
      featureFlagsConfigured,
      envFiles: envCreds.foundInFile ? [envCreds.foundInFile] : [],
      issues,
      recommendations
    };
  }

  async install(options: InstallOptions): Promise<SetupChanges> {
    const changes: SetupChanges = {
      createdFiles: [],
      modifiedFiles: [],
      addedEnvVars: [],
      installedPackages: [],
      diffs: []
    };

    const hasSrc = await this.directoryExists(path.join(options.cwd, 'src'));
    const baseDir = hasSrc ? path.join(options.cwd, 'src') : options.cwd;
    const isTypeScript = (await this.fileExists(path.join(options.cwd, 'tsconfig.json'))) || (await this.fileExists(path.join(baseDir, 'app', 'layout.tsx')));

    const ext = isTypeScript ? 'ts' : 'js';
    const jsxExt = isTypeScript ? 'tsx' : 'jsx';

    // 1. Create lib/traceiq.{ts,js}
    const libDir = path.join(baseDir, 'lib');
    await fs.mkdir(libDir, { recursive: true });
    const clientFilePath = path.join(libDir, `traceiq.${ext}`);
    const clientCode = `import { traceiq } from 'traceiq-sdk-js';

export { traceiq };
`;

    if (!(await this.fileExists(clientFilePath))) {
      if (!options.dryRun) {
        await fs.writeFile(clientFilePath, clientCode, 'utf8');
      }
      changes.createdFiles.push(path.relative(options.cwd, clientFilePath).replace(/\\/g, '/'));
    }

    // 2. Create components/traceiq-provider.{tsx,jsx}
    const componentsDir = path.join(baseDir, 'components');
    await fs.mkdir(componentsDir, { recursive: true });
    const providerFilePath = path.join(componentsDir, `traceiq-provider.${jsxExt}`);

    const autoCaptureExceptions = options.selectedProducts.includes('error-tracking');
    const autoCaptureWebVitals = options.selectedProducts.includes('web-vitals');
    const autoTrackPageViews = options.selectedProducts.includes('web-analytics') || options.selectedProducts.includes('product-analytics');

    const providerCode = `'use client';

import { useEffect } from 'react';
import { traceiq } from '@/lib/traceiq';

export function TraceIQProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID;
    const writeKey = process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY;
    const endpoint = process.env.NEXT_PUBLIC_TRACEIQ_API_URL || '${options.apiUrl}';

    if (!projectId || !writeKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[TraceIQ] Missing NEXT_PUBLIC_TRACEIQ_PROJECT_ID or NEXT_PUBLIC_TRACEIQ_WRITE_KEY');
      }
      return;
    }

    traceiq.initialize({
      projectId,
      writeKey,
      endpoint,
      autoTrackPageViews: ${autoTrackPageViews},
      autoCaptureExceptions: ${autoCaptureExceptions},
      autoCaptureWebVitals: ${autoCaptureWebVitals},
      autoCaptureRageClicks: true
    });
  }, []);

  return <>{children}</>;
}
`;

    if (!(await this.fileExists(providerFilePath))) {
      if (!options.dryRun) {
        await fs.writeFile(providerFilePath, providerCode, 'utf8');
      }
      changes.createdFiles.push(path.relative(options.cwd, providerFilePath).replace(/\\/g, '/'));
    }

    // 3. Inject into app/layout.tsx or pages/_app.tsx
    const appLayoutPath = await this.findFirstExisting([
      path.join(baseDir, 'app', 'layout.tsx'),
      path.join(baseDir, 'app', 'layout.jsx'),
      path.join(baseDir, 'app', 'layout.js')
    ]);

    if (appLayoutPath) {
      const layoutContent = await fs.readFile(appLayoutPath, 'utf8');
      if (!layoutContent.includes('TraceIQProvider')) {
        let updatedLayout = layoutContent;

        // Add import
        const importStatement = `import { TraceIQProvider } from '@/components/traceiq-provider';\n`;
        updatedLayout = importStatement + updatedLayout;

        // Wrap children with <TraceIQProvider>
        if (updatedLayout.includes('{children}')) {
          updatedLayout = updatedLayout.replace('{children}', '<TraceIQProvider>{children}</TraceIQProvider>');
        }

        if (!options.dryRun) {
          await fs.writeFile(appLayoutPath, updatedLayout, 'utf8');
        }
        changes.modifiedFiles.push(path.relative(options.cwd, appLayoutPath).replace(/\\/g, '/'));
      }
    }

    // 4. Update environment file (.env.local, .env, .env.development)
    const envFileName = await resolveTargetEnvFile(options.cwd);
    const envVarsToAdd: Record<string, string> = {
      NEXT_PUBLIC_TRACEIQ_PROJECT_ID: options.projectId,
      NEXT_PUBLIC_TRACEIQ_WRITE_KEY: options.writeKey,
      NEXT_PUBLIC_TRACEIQ_API_URL: options.apiUrl
    };

    const envResult = await applyEnvVariables(options.cwd, envFileName, envVarsToAdd, options.dryRun);
    if (envResult.created) {
      changes.createdFiles.push(envFileName);
    } else if (envResult.modified) {
      changes.modifiedFiles.push(envFileName);
    }
    changes.addedEnvVars.push(...envResult.addedVars);

    // 5. Update package.json dependency
    const pkgPath = path.join(options.cwd, 'package.json');
    try {
      const pkgContent = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      pkg.dependencies = pkg.dependencies ?? {};
      if (!pkg.dependencies['traceiq-sdk-js']) {
        pkg.dependencies['traceiq-sdk-js'] = '^0.1.7';
        changes.installedPackages.push('traceiq-sdk-js');
        if (!options.dryRun) {
          await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        }
        changes.modifiedFiles.push('package.json');
      }
    } catch {
      // ignore
    }

    return changes;
  }

  getVerificationInstructions(session: {
    verificationId: string;
    projectId: string;
    writeKey: string;
    apiUrl: string;
  }): string[] {
    return [
      '1. Start your Next.js application (e.g. npm run dev / pnpm dev).',
      '2. Open your application in the browser at http://localhost:3000.',
      '3. Navigate between pages or trigger any event to dispatch the verification payload.'
    ];
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async findFirstExisting(filePaths: string[]): Promise<string | null> {
    for (const fp of filePaths) {
      if (await this.fileExists(fp)) return fp;
    }
    return null;
  }
}

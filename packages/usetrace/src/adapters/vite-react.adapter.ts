import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter, InstallOptions } from './adapter.interface.js';
import { SetupChanges, SetupState } from '../types.js';
import { detectExistingEnvCredentials, detectPackageManager, getProjectMetadata } from './detector.js';

export class ViteReactAdapter implements FrameworkAdapter {
  readonly name = 'React (Vite)';
  readonly frameworkId = 'vite-react';

  async detect(cwd: string): Promise<boolean> {
    const meta = await getProjectMetadata(cwd);
    if ((meta.dependencies['react'] || meta.devDependencies['react']) && (meta.dependencies['vite'] || meta.devDependencies['vite'])) {
      return true;
    }

    try {
      const files = await fs.readdir(cwd);
      if (files.includes('vite.config.ts') || files.includes('vite.config.js') || files.includes('vite.config.mjs')) {
        return true;
      }
    } catch {
      // not vite
    }
    return false;
  }

  async inspect(cwd: string): Promise<SetupState> {
    const meta = await getProjectMetadata(cwd);
    const pm = await detectPackageManager(cwd);
    const envCreds = await detectExistingEnvCredentials(cwd);

    const sdkDetected = Boolean(meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js']);
    const sdkVersion = meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js'];

    const hasProvider =
      (await this.fileExists(path.join(cwd, 'src', 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'src', 'lib', 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'src', 'traceiq.js')));

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!sdkDetected) issues.push('TraceIQ SDK is not installed in dependencies.');
    if (!hasProvider) issues.push('TraceIQ initialization is missing from application entry.');
    if (!envCreds.projectId || !envCreds.writeKey) issues.push('TraceIQ environment variables are missing.');

    return {
      projectName: meta.projectName,
      framework: 'React (Vite)',
      packageManager: pm,
      sdkDetected,
      sdkVersion,
      providerConfigured: hasProvider,
      projectKeyConfigured: Boolean(envCreds.projectId && envCreds.writeKey),
      pageViewsConfigured: hasProvider,
      userIdentificationConfigured: false,
      errorTrackingConfigured: hasProvider,
      webVitalsConfigured: hasProvider,
      featureFlagsConfigured: false,
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

    const isTypeScript = (await this.fileExists(path.join(options.cwd, 'tsconfig.json'))) || (await this.fileExists(path.join(options.cwd, 'src', 'main.tsx')));
    const ext = isTypeScript ? 'ts' : 'js';

    // 1. Create src/traceiq.{ts,js}
    const srcDir = path.join(options.cwd, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const initFilePath = path.join(srcDir, `traceiq.${ext}`);

    const autoCaptureExceptions = options.selectedProducts.includes('error-tracking');
    const autoCaptureWebVitals = options.selectedProducts.includes('web-vitals');

    const initCode = `import { traceiq } from 'traceiq-sdk-js';

const projectId = import.meta.env.VITE_TRACEIQ_PROJECT_ID || '${options.projectId}';
const writeKey = import.meta.env.VITE_TRACEIQ_WRITE_KEY || '${options.writeKey}';
const endpoint = import.meta.env.VITE_TRACEIQ_API_URL || '${options.apiUrl}';

if (projectId && writeKey) {
  traceiq.initialize({
    projectId,
    writeKey,
    endpoint,
    autoTrackPageViews: true,
    autoCaptureExceptions: ${autoCaptureExceptions},
    autoCaptureWebVitals: ${autoCaptureWebVitals},
    autoCaptureRageClicks: true
  });
}

export { traceiq };
`;

    if (!(await this.fileExists(initFilePath))) {
      if (!options.dryRun) {
        await fs.writeFile(initFilePath, initCode, 'utf8');
      }
      changes.createdFiles.push(path.relative(options.cwd, initFilePath).replace(/\\/g, '/'));
    }

    // 2. Import into main.{tsx,jsx}
    const mainFile = await this.findFirstExisting([
      path.join(srcDir, 'main.tsx'),
      path.join(srcDir, 'main.jsx'),
      path.join(srcDir, 'index.tsx'),
      path.join(srcDir, 'index.jsx')
    ]);

    if (mainFile) {
      const content = await fs.readFile(mainFile, 'utf8');
      if (!content.includes('./traceiq')) {
        const updated = `import './traceiq';\n` + content;
        if (!options.dryRun) {
          await fs.writeFile(mainFile, updated, 'utf8');
        }
        changes.modifiedFiles.push(path.relative(options.cwd, mainFile).replace(/\\/g, '/'));
      }
    }

    // 3. Update .env
    const envPath = path.join(options.cwd, '.env');
    let existingEnv = '';
    try {
      existingEnv = await fs.readFile(envPath, 'utf8');
    } catch {
      // not created yet
    }

    const newLines: string[] = [];
    if (!existingEnv.includes('VITE_TRACEIQ_PROJECT_ID=')) {
      newLines.push(`VITE_TRACEIQ_PROJECT_ID=${options.projectId}`);
      changes.addedEnvVars.push('VITE_TRACEIQ_PROJECT_ID');
    }
    if (!existingEnv.includes('VITE_TRACEIQ_WRITE_KEY=')) {
      newLines.push(`VITE_TRACEIQ_WRITE_KEY=${options.writeKey}`);
      changes.addedEnvVars.push('VITE_TRACEIQ_WRITE_KEY');
    }
    if (!existingEnv.includes('VITE_TRACEIQ_API_URL=')) {
      newLines.push(`VITE_TRACEIQ_API_URL=${options.apiUrl}`);
      changes.addedEnvVars.push('VITE_TRACEIQ_API_URL');
    }

    if (newLines.length > 0) {
      const append = (existingEnv ? (existingEnv.endsWith('\n') ? '' : '\n') : '') +
        '\n# TraceIQ Configuration\n' +
        newLines.join('\n') +
        '\n';
      if (!options.dryRun) {
        await fs.writeFile(envPath, (existingEnv || '') + append, 'utf8');
      }
      if (existingEnv) {
        changes.modifiedFiles.push('.env');
      } else {
        changes.createdFiles.push('.env');
      }
    }

    // 4. Add dependency
    const pkgPath = path.join(options.cwd, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
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

  getVerificationInstructions(): string[] {
    return [
      '1. Start your Vite dev server (e.g. npm run dev / pnpm dev).',
      '2. Open your application in the browser at http://localhost:5173.',
      '3. Interact with the application to dispatch the verification payload.'
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

  private async findFirstExisting(filePaths: string[]): Promise<string | null> {
    for (const fp of filePaths) {
      if (await this.fileExists(fp)) return fp;
    }
    return null;
  }
}

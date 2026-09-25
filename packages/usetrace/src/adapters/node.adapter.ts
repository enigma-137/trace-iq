import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter, InstallOptions } from './adapter.interface.js';
import { SetupChanges, SetupState } from '../types.js';
import { detectExistingEnvCredentials, detectPackageManager, getProjectMetadata } from './detector.js';

export class NodeAdapter implements FrameworkAdapter {
  readonly name = 'Node.js';
  readonly frameworkId = 'node';

  async detect(cwd: string): Promise<boolean> {
    try {
      const files = await fs.readdir(cwd);
      return files.includes('package.json');
    } catch {
      return false;
    }
  }

  async inspect(cwd: string): Promise<SetupState> {
    const meta = await getProjectMetadata(cwd);
    const pm = await detectPackageManager(cwd);
    const envCreds = await detectExistingEnvCredentials(cwd);

    const sdkDetected = Boolean(meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js']);
    const sdkVersion = meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js'];

    const hasClient =
      (await this.fileExists(path.join(cwd, 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'src', 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'traceiq.js')));

    const issues: string[] = [];
    if (!sdkDetected) issues.push('TraceIQ SDK is not installed in dependencies.');
    if (!hasClient) issues.push('TraceIQ initialization module is not configured.');
    if (!envCreds.projectId || !envCreds.writeKey) issues.push('TraceIQ environment variables are missing.');

    return {
      projectName: meta.projectName,
      framework: 'Node.js',
      packageManager: pm,
      sdkDetected,
      sdkVersion,
      providerConfigured: hasClient,
      projectKeyConfigured: Boolean(envCreds.projectId && envCreds.writeKey),
      pageViewsConfigured: false,
      userIdentificationConfigured: false,
      errorTrackingConfigured: hasClient,
      webVitalsConfigured: false,
      featureFlagsConfigured: false,
      envFiles: envCreds.foundInFile ? [envCreds.foundInFile] : [],
      issues,
      recommendations: []
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

    const isTypeScript = await this.fileExists(path.join(options.cwd, 'tsconfig.json'));
    const ext = isTypeScript ? 'ts' : 'js';
    const filePath = path.join(options.cwd, `traceiq.${ext}`);

    const initCode = `import { traceiq } from 'traceiq-sdk-js';

const projectId = process.env.TRACEIQ_PROJECT_ID || '${options.projectId}';
const writeKey = process.env.TRACEIQ_WRITE_KEY || '${options.writeKey}';
const endpoint = process.env.TRACEIQ_API_URL || '${options.apiUrl}';

if (projectId && writeKey) {
  traceiq.initialize({
    projectId,
    writeKey,
    endpoint,
    autoCaptureExceptions: true
  });
}

export { traceiq };
`;

    if (!(await this.fileExists(filePath))) {
      if (!options.dryRun) {
        await fs.writeFile(filePath, initCode, 'utf8');
      }
      changes.createdFiles.push(`traceiq.${ext}`);
    }

    // Update .env
    const envPath = path.join(options.cwd, '.env');
    let existingEnv = '';
    try {
      existingEnv = await fs.readFile(envPath, 'utf8');
    } catch {
      // ignore
    }

    const newLines: string[] = [];
    if (!existingEnv.includes('TRACEIQ_PROJECT_ID=')) {
      newLines.push(`TRACEIQ_PROJECT_ID=${options.projectId}`);
      changes.addedEnvVars.push('TRACEIQ_PROJECT_ID');
    }
    if (!existingEnv.includes('TRACEIQ_WRITE_KEY=')) {
      newLines.push(`TRACEIQ_WRITE_KEY=${options.writeKey}`);
      changes.addedEnvVars.push('TRACEIQ_WRITE_KEY');
    }
    if (!existingEnv.includes('TRACEIQ_API_URL=')) {
      newLines.push(`TRACEIQ_API_URL=${options.apiUrl}`);
      changes.addedEnvVars.push('TRACEIQ_API_URL');
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

    // Add dependency
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
      '1. Start your Node.js application (e.g. node index.js / npm start).',
      '2. Trigger your application entry to initialize TraceIQ and emit the verification event.'
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
}

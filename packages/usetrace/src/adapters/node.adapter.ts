import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter, InstallOptions } from './adapter.interface.js';
import { SetupChanges, SetupState } from '../types.js';
import {
  applyEnvVariables,
  detectExistingEnvCredentials,
  detectPackageManager,
  ensurePackageInstalled,
  getProjectMetadata,
  isPackageResolvable,
  resolveTargetEnvFile
} from './detector.js';
import { SDK_PACKAGES } from './sdk-packages.js';

const NODE_SDK = SDK_PACKAGES.node.name;

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

    // Node apps use the server SDK, not the browser one.
    const isResolvable = await isPackageResolvable(cwd, NODE_SDK);
    const inPkgJson = Boolean(meta.dependencies[NODE_SDK] || meta.devDependencies[NODE_SDK]);
    const sdkDetected = isResolvable;
    const sdkVersion = inPkgJson ? (meta.dependencies[NODE_SDK] || meta.devDependencies[NODE_SDK]) : undefined;

    const hasClient =
      (await this.fileExists(path.join(cwd, 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'src', 'traceiq.ts'))) ||
      (await this.fileExists(path.join(cwd, 'traceiq.js'))) ||
      (await this.fileExists(path.join(cwd, 'traceiq.mjs')));
    const browserSdkOnServer = Boolean(meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js']);

    const issues: string[] = [];
    if (!sdkDetected) {
      if (inPkgJson) {
        issues.push('TraceIQ SDK is listed in package.json but not resolvable in node_modules.');
      } else {
        issues.push('TraceIQ SDK is not installed in dependencies.');
      }
    }
    if (!hasClient) issues.push('TraceIQ initialization module is not configured.');
    const recommendations: string[] = [];
    if (browserSdkOnServer && !inPkgJson) {
      recommendations.push(`This Node app depends on the browser SDK (traceiq-sdk-js). Use ${NODE_SDK} on the server.`);
    }
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

    // Ensure the server SDK is installed with the project's package manager and resolvable.
    const wasInstalled = await ensurePackageInstalled(options.cwd, NODE_SDK, options.packageManager, options.dryRun);
    if (wasInstalled) {
      changes.installedPackages.push(NODE_SDK);
    }

    const isTypeScript = await this.fileExists(path.join(options.cwd, 'tsconfig.json'));
    const meta = await this.readPackageJson(options.cwd);
    const esm = meta?.type === 'module';
    // TypeScript compiles imports either way; plain JS must match the package's module type.
    const ext = isTypeScript ? 'ts' : 'js';
    const fileName = `traceiq.${ext}`;
    const filePath = path.join(options.cwd, fileName);

    if (!(await this.fileExists(filePath))) {
      if (!options.dryRun) {
        await fs.writeFile(filePath, nodeClientModule(isTypeScript || esm), 'utf8');
      }
      changes.createdFiles.push(fileName);
    }

    // Update environment file
    const envFileName = await resolveTargetEnvFile(options.cwd);
    const envVarsToAdd: Record<string, string> = {
      TRACEIQ_PROJECT_ID: options.projectId,
      TRACEIQ_WRITE_KEY: options.writeKey,
      TRACEIQ_API_URL: options.apiUrl
    };

    const envResult = await applyEnvVariables(options.cwd, envFileName, envVarsToAdd, options.dryRun);
    if (envResult.created) {
      changes.createdFiles.push(envFileName);
    } else if (envResult.modified) {
      changes.modifiedFiles.push(envFileName);
    }
    changes.addedEnvVars.push(...envResult.addedVars);

    // Add dependency
    const pkgPath = path.join(options.cwd, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      pkg.dependencies = pkg.dependencies ?? {};
      if (!pkg.dependencies[NODE_SDK]) {
        pkg.dependencies[NODE_SDK] = SDK_PACKAGES.node.range;
        if (!changes.installedPackages.includes(NODE_SDK)) changes.installedPackages.push(NODE_SDK);
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
      '2. Import `traceiq` from ./traceiq where your server is created and add `if (traceiq) app.use(traceiq.middleware());`, or send an event with `traceiq?.capture({ event: \'app_started\' })`.',
      '3. Trigger a request so the verification event is sent. Call `await traceiq?.shutdown()` before short-lived scripts exit.'
    ];
  }

  private async readPackageJson(cwd: string): Promise<{ type?: string } | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')) as { type?: string };
    } catch {
      return null;
    }
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

/**
 * One shared client for the process, or null when the env vars are missing: the
 * TraceIQ constructor throws without a write key, and analytics must never stop the app.
 * The Node SDK has no default endpoint beyond localhost, so it is always passed.
 */
export function nodeClientModule(esm: boolean): string {
  const body = `const projectId = process.env.TRACEIQ_PROJECT_ID;
const writeKey = process.env.TRACEIQ_WRITE_KEY;
const endpoint = process.env.TRACEIQ_API_URL || process.env.TRACEIQ_ENDPOINT || 'https://api.traceiq.run';

${esm ? 'export ' : ''}const traceiq = projectId && writeKey ? new TraceIQ({ projectId, writeKey, endpoint }) : null;

if (!traceiq && process.env.NODE_ENV === 'development') {
  console.warn(
    '[TraceIQ] Not started: missing TRACEIQ_PROJECT_ID or TRACEIQ_WRITE_KEY.\\n' +
    'Restart the application after changing environment variables.'
  );
}
`;
  return esm
    ? `import { TraceIQ } from '${NODE_SDK}';\n\n${body}`
    : `const { TraceIQ } = require('${NODE_SDK}');\n\n${body}\nmodule.exports = { traceiq };\n`;
}

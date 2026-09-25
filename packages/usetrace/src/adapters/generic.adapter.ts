import fs from 'node:fs/promises';
import path from 'node:path';
import { FrameworkAdapter, InstallOptions } from './adapter.interface.js';
import { SetupChanges, SetupState } from '../types.js';
import { detectExistingEnvCredentials, detectPackageManager, getProjectMetadata } from './detector.js';

export class GenericWebAdapter implements FrameworkAdapter {
  readonly name = 'Generic Web / JavaScript';
  readonly frameworkId = 'generic-web';

  async detect(): Promise<boolean> {
    return true; // Fallback adapter
  }

  async inspect(cwd: string): Promise<SetupState> {
    const meta = await getProjectMetadata(cwd);
    const pm = await detectPackageManager(cwd);
    const envCreds = await detectExistingEnvCredentials(cwd);

    const sdkDetected = Boolean(meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js']);
    const sdkVersion = meta.dependencies['traceiq-sdk-js'] || meta.devDependencies['traceiq-sdk-js'];

    return {
      projectName: meta.projectName,
      framework: 'JavaScript / HTML',
      packageManager: pm,
      sdkDetected,
      sdkVersion,
      providerConfigured: sdkDetected,
      projectKeyConfigured: Boolean(envCreds.projectId && envCreds.writeKey),
      pageViewsConfigured: false,
      userIdentificationConfigured: false,
      errorTrackingConfigured: false,
      webVitalsConfigured: false,
      featureFlagsConfigured: false,
      envFiles: envCreds.foundInFile ? [envCreds.foundInFile] : [],
      issues: !sdkDetected ? ['TraceIQ SDK is not installed.'] : [],
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

    const snippetPath = path.join(options.cwd, 'traceiq.js');
    const snippetCode = `// TraceIQ Client Initialization
import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: '${options.projectId}',
  writeKey: '${options.writeKey}',
  endpoint: '${options.apiUrl}',
  autoTrackPageViews: true,
  autoCaptureExceptions: true,
  autoCaptureWebVitals: true
});

export { traceiq };
`;

    if (!options.dryRun) {
      await fs.writeFile(snippetPath, snippetCode, 'utf8');
    }
    changes.createdFiles.push('traceiq.js');

    return changes;
  }

  getVerificationInstructions(): string[] {
    return [
      '1. Import and run traceiq.js in your application entry.',
      '2. Send a test event to verify ingestion.'
    ];
  }
}

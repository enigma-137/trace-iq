import { FrameworkAdapter, InstallOptions } from '../adapters/adapter.interface.js';
import { SetupChanges, SetupReport, SetupState, TRACEIQ_PRODUCTS, TraceIQProduct } from '../types.js';

export class TraceIQInstaller {
  constructor(private readonly adapter: FrameworkAdapter) {}

  async inspect(cwd: string): Promise<SetupState> {
    return this.adapter.inspect(cwd);
  }

  async install(options: InstallOptions): Promise<SetupChanges> {
    return this.adapter.install(options);
  }

  createReport(
    state: SetupState,
    changes: SetupChanges,
    selectedProducts: TraceIQProduct[],
    verificationStatus: 'verified' | 'failed' | 'skipped' | 'timeout',
    firstVerifiedEvent?: { name: string; timestamp: string; source?: string; host?: string; environment?: string }
  ): SetupReport {
    const productNames = selectedProducts.map(
      (id) => TRACEIQ_PRODUCTS.find((p) => p.id === id)?.name ?? id
    );

    const allFilesChanged = [...changes.createdFiles, ...changes.modifiedFiles];

    const warnings: string[] = [];
    if (!state.projectKeyConfigured && changes.addedEnvVars.length === 0) {
      warnings.push('TraceIQ environment variables may need to be deployed to your hosting platform (Vercel, Render, etc.).');
    }

    const recommendations: string[] = [];
    if (!selectedProducts.includes('user-identification')) {
      recommendations.push('Consider adding user identification (traceiq.identify) after user sign-in.');
    }
    if (!selectedProducts.includes('error-tracking')) {
      recommendations.push('Enable error tracking to automatically record uncaught exceptions in production.');
    }

    return {
      detectedFramework: state.framework,
      detectedSdk: 'traceiq-sdk-js',
      sdkVersion: state.sdkVersion,
      packageManager: state.packageManager,
      enabledProducts: productNames,
      filesChanged: allFilesChanged,
      envVarsConfigured: changes.addedEnvVars,
      verificationStatus,
      firstVerifiedEvent,
      warnings,
      recommendations
    };
  }
}

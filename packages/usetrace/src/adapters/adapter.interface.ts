import { SetupChanges, SetupState, TraceIQProduct } from '../types.js';

export interface InstallOptions {
  cwd: string;
  projectId: string;
  writeKey: string;
  apiUrl: string;
  selectedProducts: TraceIQProduct[];
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  dryRun?: boolean;
}

export interface FrameworkAdapter {
  readonly name: string;
  readonly frameworkId: string;

  detect(cwd: string): Promise<boolean>;

  inspect(cwd: string): Promise<SetupState>;

  install(options: InstallOptions): Promise<SetupChanges>;

  getVerificationInstructions(session: {
    verificationId: string;
    projectId: string;
    writeKey: string;
    apiUrl: string;
  }): string[];
}

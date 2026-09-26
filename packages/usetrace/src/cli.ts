import path from 'node:path';
import {
  colors,
  createSpinner,
  logError,
  logInfo,
  logStep,
  logSuccess,
  logWarning,
  multiSelectPrompt,
  printBanner,
  renderFileChanges,
  renderSetupReport,
  renderVerificationCard,
  selectPrompt,
  symbols,
  textPrompt
} from './terminal/ui.js';
import {
  detectExistingEnvCredentials,
  detectPackageManager,
  resolveDefaultApiUrl,
  resolveFrameworkAdapter
} from './adapters/detector.js';
import { TraceIQInstaller } from './installer/installer.js';
import { TraceIQVerifier } from './verifier/verifier.js';
import { CliOptions, TRACEIQ_PRODUCTS, TraceIQProduct } from './types.js';

export async function runCli(args: string[] = []): Promise<void> {
  const cwd = process.cwd();
  const options = parseCliArgs(args);
  const command = getSubcommand(args);

  printBanner();

  const pm = await detectPackageManager(cwd);
  const adapter = await resolveFrameworkAdapter(cwd);
  const installer = new TraceIQInstaller(adapter);
  const verifier = new TraceIQVerifier();

  const state = await installer.inspect(cwd);
  const existingCreds = await detectExistingEnvCredentials(cwd);

  // Initial detection output
  logSuccess(`Project detected: ${colors.bold(state.projectName)}`);
  logSuccess(`Framework: ${colors.bold(state.framework)}`);
  logSuccess(`Package manager: ${colors.bold(pm)}`);
  logSuccess(
    `TraceIQ SDK: ${
      state.sdkDetected
        ? colors.green(`detected ${state.sdkVersion ? `(v${state.sdkVersion})` : ''}`)
        : colors.dim('not detected')
    }`
  );

  const defaultApiUrl = resolveDefaultApiUrl(options.apiUrl, existingCreds.apiUrl);

  // Handle direct commands (e.g. `npx usetrace audit` or `npx usetrace verify`)
  if (command === 'audit' || command === 'doctor') {
    await runAuditFlow(state);
    return;
  }

  if (command === 'verify') {
    await runVerificationOnlyFlow(verifier, options, existingCreds, defaultApiUrl);
    return;
  }

  // If TraceIQ is already installed, show rerun menu
  if (state.sdkDetected && state.providerConfigured && state.projectKeyConfigured) {
    console.log(`\n${colors.bold('TraceIQ is already installed.')}\n`);
    logSuccess('SDK detected');
    logSuccess('Provider configured');
    logSuccess('Project key configured');
    if (state.pageViewsConfigured) logSuccess('Page views configured');
    if (!state.userIdentificationConfigured) logWarning('User identification missing');
    if (!state.errorTrackingConfigured) logWarning('Error tracking missing');
    if (!state.webVitalsConfigured) logWarning('Web Vitals missing');

    const action = await selectPrompt(
      'What would you like to do?',
      [
        { value: 'audit', label: 'Audit current setup', hint: 'Inspect all instrumentation & health' },
        { value: 'add-missing', label: 'Add missing instrumentation', hint: 'Configure unconfigured features' },
        { value: 'verify', label: 'Verify installation', hint: 'Send a live verification event' },
        { value: 'reconfigure', label: 'Reconfigure products', hint: 'Select active products' },
        { value: 'report', label: 'View setup report', hint: 'Display configuration summary' }
      ]
    );

    if (action === 'audit') {
      await runAuditFlow(state);
      return;
    }

    if (action === 'verify') {
      await runVerificationOnlyFlow(verifier, options, existingCreds, defaultApiUrl);
      return;
    }

    if (action === 'report') {
      const report = installer.createReport(
        state,
        { createdFiles: [], modifiedFiles: [], addedEnvVars: [], installedPackages: [], diffs: [] },
        ['product-analytics', 'web-analytics'],
        'verified'
      );
      renderSetupReport(report);
      return;
    }
  }

  // Interactive Product Configuration
  const initialProducts = TRACEIQ_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    selected: p.defaultSelected
  }));

  const selectedProducts = await multiSelectPrompt(
    'What would you like to configure?',
    initialProducts
  );

  if (selectedProducts.length === 0) {
    logWarning('No products selected. Exiting.');
    return;
  }

  // Resolve or Prompt for Credentials
  let projectId = options.projectId || existingCreds.projectId;
  let writeKey = options.writeKey || existingCreds.writeKey;

  if (!projectId) {
    console.log();
    projectId = await textPrompt('Enter your TraceIQ Project ID', 'prj_default');
  }

  if (!writeKey) {
    writeKey = await textPrompt('Enter your TraceIQ Write Key', 'tiq_live_default');
  }

  // Installation
  const spinner = createSpinner('Configuring TraceIQ...').start();

  let changes;
  try {
    changes = await installer.install({
      cwd,
      projectId,
      writeKey,
      apiUrl: defaultApiUrl,
      selectedProducts,
      packageManager: pm,
      dryRun: options.dryRun
    });
    spinner.succeed('TraceIQ configured successfully.');
  } catch (error) {
    spinner.fail(`Failed to configure TraceIQ: ${error instanceof Error ? error.message : error}`);
    return;
  }

  // Display Changes Summary
  renderFileChanges(changes);

  // Verification Step
  if (options.skipVerify) {
    logInfo('Skipping verification step (--skip-verify).');
    const report = installer.createReport(state, changes, selectedProducts, 'skipped');
    renderSetupReport(report);
    return;
  }

  console.log(`\n${colors.bold('Verifying TraceIQ connection...')}`);
  console.log(colors.dim('The wizard will wait for a real event to traverse the ingestion pipeline.\n'));

  const verifySpinner = createSpinner('Creating verification session...').start();
  let session;
  try {
    session = await verifier.createSession(defaultApiUrl, projectId, writeKey, 300);
    verifySpinner.succeed(`Verification session ready (${session.verificationId})`);
  } catch (error) {
    verifySpinner.warn(`Could not connect to backend verification API (${defaultApiUrl}).`);
    logInfo('Make sure your TraceIQ API is running, then verify with `npx traceiq-cli verify`.');
    const report = installer.createReport(state, changes, selectedProducts, 'skipped');
    renderSetupReport(report);
    return;
  }

  const instructions = adapter.getVerificationInstructions({
    verificationId: session.verificationId,
    projectId,
    writeKey,
    apiUrl: defaultApiUrl
  });
  console.log(`\n${colors.bold('Next steps:')}`);
  instructions.forEach((ins) => console.log(`  ${colors.cyan(symbols.dot)} ${ins}`));

  // In local development or testing, optionally dispatch a probe if requested via flag
  const timeoutSec = options.timeout ?? 300;
  const listenSpinner = createSpinner('Waiting for your first event...').start();

  try {
    if (options.probe) {
      setTimeout(() => {
        void verifier.dispatchProbe(defaultApiUrl, projectId, writeKey, session.verificationId).catch(() => {});
      }, 1000);
    }

    const result = await verifier.waitForVerification(defaultApiUrl, session.verificationId, timeoutSec);
    listenSpinner.succeed('Event received!');

    renderVerificationCard({
      eventName: result.event.name,
      projectName: result.projectName ?? state.projectName,
      environment: result.event.environment ?? 'development',
      source: result.event.source ?? 'localhost:3000',
      receivedAt: 'just now'
    });

    const report = installer.createReport(state, changes, selectedProducts, 'verified', {
      name: result.event.name,
      timestamp: new Date().toLocaleTimeString(),
      source: result.event.source,
      environment: result.event.environment
    });

    renderSetupReport(report);
  } catch (error) {
    listenSpinner.fail(`Could not verify the connection: ${error instanceof Error ? error.message : error}`);
    console.log(`\n  ${colors.yellow('Troubleshooting:')}`);
    console.log(`  1. Confirm your development server is running and accessible.`);
    console.log(`  2. Ensure NEXT_PUBLIC_TRACEIQ_API_URL or TRACEIQ_API_URL points to ${defaultApiUrl}.`);
    console.log(`  3. Run ${colors.bold('npx traceiq-cli verify')} once your app is active.`);

    const report = installer.createReport(state, changes, selectedProducts, 'timeout');
    renderSetupReport(report);
    process.exitCode = 1;
  }
}

async function runAuditFlow(state: any) {
  logStep('TraceIQ Audit & Diagnostics');
  console.log(`  Framework:             ${state.framework}`);
  console.log(`  SDK Installed:         ${state.sdkDetected ? colors.green('✓ Yes') : colors.red('✕ No')}`);
  console.log(`  Provider Configured:   ${state.providerConfigured ? colors.green('✓ Yes') : colors.yellow('! No')}`);
  console.log(`  Project Key Set:       ${state.projectKeyConfigured ? colors.green('✓ Yes') : colors.red('✕ No')}`);
  console.log(`  Pageviews Auto-Track:  ${state.pageViewsConfigured ? colors.green('✓ Active') : colors.dim('Inactive')}`);
  console.log(`  Error Tracking:        ${state.errorTrackingConfigured ? colors.green('✓ Active') : colors.dim('Inactive')}`);
  console.log(`  Web Vitals:            ${state.webVitalsConfigured ? colors.green('✓ Active') : colors.dim('Inactive')}`);

  if (state.issues.length > 0) {
    console.log(`\n  ${colors.yellow(colors.bold('Issues Found:'))}`);
    state.issues.forEach((i: string) => console.log(`   ${colors.yellow(symbols.warn)} ${i}`));
  } else {
    console.log(`\n  ${colors.green(symbols.check)} ${colors.green('All core instrumentation checks passed.')}`);
  }
}

async function runVerificationOnlyFlow(
  verifier: TraceIQVerifier,
  options: CliOptions,
  existingCreds: any,
  apiUrl: string
) {
  const projectId = options.projectId || existingCreds.projectId;
  const writeKey = options.writeKey || existingCreds.writeKey;

  if (!projectId || !writeKey) {
    logError('Project ID or Write Key missing. Provide via .env or --project-id and --write-key.');
    process.exitCode = 1;
    return;
  }

  const spinner = createSpinner('Creating verification session...').start();
  let session;
  try {
    session = await verifier.createSession(apiUrl, projectId, writeKey, 180);
    spinner.succeed(`Session active (${session.verificationId})`);
  } catch (err) {
    spinner.fail(`Failed to create session: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  const timeoutSec = options.timeout ?? 180;
  const listenSpinner = createSpinner('Waiting for incoming event...').start();

  try {
    if (options.probe) {
      setTimeout(() => {
        void verifier.dispatchProbe(apiUrl, projectId, writeKey, session.verificationId).catch(() => {});
      }, 1000);
    }

    const result = await verifier.waitForVerification(apiUrl, session.verificationId, timeoutSec);
    listenSpinner.succeed('Event verified!');

    renderVerificationCard({
      eventName: result.event.name,
      projectName: result.projectName,
      environment: result.event.environment ?? 'development',
      source: result.event.source ?? 'localhost:3000',
      receivedAt: 'just now'
    });
    process.exitCode = 0;
  } catch (err) {
    listenSpinner.fail(`Verification failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--api-url' && args[i + 1]) {
      options.apiUrl = args[++i];
    } else if (arg === '--project-id' && args[i + 1]) {
      options.projectId = args[++i];
    } else if (arg === '--write-key' && args[i + 1]) {
      options.writeKey = args[++i];
    } else if (arg === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--probe' || arg === '--auto-probe') {
      options.probe = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-verify') {
      options.skipVerify = true;
    }
  }
  return options;
}

function getSubcommand(args: string[]): string | null {
  const first = args[0];
  if (first && !first.startsWith('-')) {
    return first.toLowerCase();
  }
  return null;
}

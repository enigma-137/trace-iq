export interface ActionInputs {
  apiKey: string;
  projectId: string;
  previewUrl: string;
  monitors: string[];
  apiUrl?: string;
  appUrl?: string;
  environment?: string;
  timeoutSeconds?: number;
  pollIntervalSeconds?: number;
  idempotencyKey?: string;
}

export interface GitContext {
  provider?: string;
  repository?: string;
  commitSha?: string;
  branch?: string;
  pullRequest?: number;
}

export interface ActionRunResult {
  status: 'passed' | 'failed' | 'timed_out';
  runGroupId: string;
  totalMonitors: number;
  passedCount: number;
  failedCount: number;
  summary: string;
  exitCode: number;
}

export function parseInputs(env: Record<string, string | undefined>): ActionInputs {
  const apiKey = env['INPUT_API-KEY'] || env['INPUT_API_KEY'] || env['TRACEIQ_API_KEY'] || '';
  const projectId = env['INPUT_PROJECT-ID'] || env['INPUT_PROJECT_ID'] || env['TRACEIQ_PROJECT_ID'] || '';
  const previewUrl = env['INPUT_PREVIEW-URL'] || env['INPUT_PREVIEW_URL'] || '';
  const rawMonitors = env['INPUT_MONITORS'] || env['INPUT_MONITOR-IDS'] || env['INPUT_MONITOR_IDS'] || '';

  if (!apiKey.trim()) {
    throw new Error('TraceIQ Action error: "api-key" is required.');
  }
  if (!projectId.trim()) {
    throw new Error('TraceIQ Action error: "project-id" is required.');
  }
  if (!previewUrl.trim()) {
    throw new Error('TraceIQ Action error: "preview-url" is required.');
  }

  const monitors = rawMonitors
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (monitors.length === 0) {
    throw new Error('TraceIQ Action error: "monitors" must contain at least one monitor ID.');
  }

  const apiUrl = (env['INPUT_API-URL'] || env['INPUT_API_URL'] || 'https://api.traceiq.run').replace(/\/$/, '');
  const appUrl = (env['INPUT_APP-URL'] || env['INPUT_APP_URL'] || 'https://traceiq.run').replace(/\/$/, '');
  const environment = env['INPUT_ENVIRONMENT'] || 'preview';
  const timeoutSeconds = parseInt(env['INPUT_TIMEOUT-SECONDS'] || env['INPUT_TIMEOUT_SECONDS'] || '600', 10);
  const pollIntervalSeconds = parseInt(env['INPUT_POLL-INTERVAL-SECONDS'] || env['INPUT_POLL_INTERVAL_SECONDS'] || '5', 10);

  return {
    apiKey: apiKey.trim(),
    projectId: projectId.trim(),
    previewUrl: previewUrl.trim(),
    monitors,
    apiUrl,
    appUrl,
    environment,
    timeoutSeconds: Number.isNaN(timeoutSeconds) ? 600 : Math.max(timeoutSeconds, 10),
    pollIntervalSeconds: Number.isNaN(pollIntervalSeconds) ? 5 : Math.max(pollIntervalSeconds, 1),
    idempotencyKey: env['INPUT_IDEMPOTENCY-KEY'] || env['INPUT_IDEMPOTENCY_KEY']
  };
}

export function extractGitContext(env: Record<string, string | undefined>): GitContext {
  const repository = env['GITHUB_REPOSITORY'];
  const commitSha = env['GITHUB_SHA'];
  const branch = env['GITHUB_HEAD_REF'] || env['GITHUB_REF_NAME'];

  let pullRequest: number | undefined;
  if (env['GITHUB_REF'] && env['GITHUB_REF'].startsWith('refs/pull/')) {
    const parts = env['GITHUB_REF'].split('/');
    const prNum = parseInt(parts[2], 10);
    if (!Number.isNaN(prNum)) pullRequest = prNum;
  }

  return {
    provider: 'github',
    repository,
    commitSha,
    branch,
    pullRequest
  };
}

export async function triggerCiRuns(
  inputs: ActionInputs,
  git: GitContext,
  fetchFn: typeof fetch = fetch
): Promise<{ runGroupId: string; status: string; totalMonitors: number }> {
  const idempotencyKey =
    inputs.idempotencyKey ||
    (git.repository && git.commitSha
      ? `github:${git.repository}:${git.pullRequest || git.branch || 'ref'}:${git.commitSha}:${process.env['GITHUB_RUN_ATTEMPT'] || '1'}`
      : undefined);

  const res = await fetchFn(`${inputs.apiUrl}/v1/synthetic/ci-runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${inputs.apiKey}`,
      'x-traceiq-api-key': inputs.apiKey
    },
    body: JSON.stringify({
      projectId: inputs.projectId,
      monitorIds: inputs.monitors,
      baseUrl: inputs.previewUrl,
      environment: inputs.environment,
      git,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      `TraceIQ API trigger error (${res.status}): ${(errBody as any).message || res.statusText || 'Failed to trigger CI synthetic run'}`
    );
  }

  return res.json() as Promise<{ runGroupId: string; status: string; totalMonitors: number }>;
}

export async function pollGroupProgress(
  runGroupId: string,
  inputs: ActionInputs,
  fetchFn: typeof fetch = fetch,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<any> {
  const startTime = Date.now();
  const maxTime = (inputs.timeoutSeconds || 600) * 1000;
  const interval = (inputs.pollIntervalSeconds || 5) * 1000;

  while (Date.now() - startTime < maxTime) {
    const query = new URLSearchParams({ projectId: inputs.projectId });
    const res = await fetchFn(`${inputs.apiUrl}/v1/synthetic/ci-runs/${runGroupId}?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${inputs.apiKey}`,
        'x-traceiq-api-key': inputs.apiKey
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `TraceIQ API poll error (${res.status}): ${(errBody as any).message || res.statusText}`
      );
    }

    const data = await res.json() as { group: any; runs: any[] };
    const status = data.group?.status;

    if (status === 'passed' || status === 'failed' || status === 'timed_out') {
      return data;
    }

    await sleepFn(interval);
  }

  throw new Error(`TraceIQ synthetic checks did not complete within the ${inputs.timeoutSeconds}s CI timeout.`);
}

export function formatMarkdownSummary(data: { group: any; runs: any[] }, appUrl: string): string {
  const { group, runs } = data;
  const isPassing = group.status === 'passed';
  const icon = isPassing ? '✅' : '❌';
  const statusLabel = isPassing ? 'Passed' : group.status === 'timed_out' ? 'Timed Out' : 'Failed';

  const lines: string[] = [];
  lines.push(`## ${icon} TraceIQ Synthetic Checks: ${statusLabel}`);
  lines.push('');
  lines.push(`- **Preview URL:** \`${group.baseUrl}\``);
  lines.push(`- **Environment:** \`${group.environment}\``);
  if (group.repository) {
    lines.push(`- **Repository:** \`${group.repository}\`${group.pullRequestNumber ? ` (PR #${group.pullRequestNumber})` : ''}`);
  }
  lines.push(`- **Results:** ${group.passedMonitors} / ${group.totalMonitors} journeys passed`);
  lines.push('');

  lines.push('| Monitor | Status | Duration | Diagnostic / Failed Step |');
  lines.push('| :--- | :--- | :--- | :--- |');

  for (const run of runs || []) {
    const rIcon = run.status === 'passed' ? '✅ Pass' : run.status === 'timed_out' ? '⏳ Timed Out' : '❌ Fail';
    const duration = run.durationMs !== null && run.durationMs !== undefined ? `${run.durationMs}ms` : '—';
    const errorNote = run.failureReason ? run.failureReason.replace(/\|/g, '\\|').slice(0, 120) : '—';
    lines.push(`| \`${run.monitorId}\` | ${rIcon} | ${duration} | ${errorNote} |`);
  }

  lines.push('');
  lines.push(`[🔍 View Detailed Run Diagnostics in TraceIQ Dashboard](${appUrl}/dashboard/synthetic-monitors)`);

  return lines.join('\n');
}

export async function runSyntheticAction(
  env: Record<string, string | undefined>,
  deps: {
    fetchFn?: typeof fetch;
    sleepFn?: (ms: number) => Promise<void>;
    log?: (msg: string) => void;
    setSummary?: (markdown: string) => Promise<void> | void;
  } = {}
): Promise<ActionRunResult> {
  const log = deps.log || console.log;
  const fetchFn = deps.fetchFn || fetch;
  const sleepFn = deps.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));

  const inputs = parseInputs(env);
  const git = extractGitContext(env);

  log(`🚀 Triggering TraceIQ Synthetic Checks against preview deployment...`);
  log(`   Preview URL: ${inputs.previewUrl}`);
  log(`   Project: ${inputs.projectId}`);
  log(`   Monitors (${inputs.monitors.length}): ${inputs.monitors.join(', ')}`);

  const triggerResult = await triggerCiRuns(inputs, git, fetchFn);
  log(`⚡ CI Run Group created: ${triggerResult.runGroupId} (status: ${triggerResult.status})`);
  log(`⏳ Waiting for Playwright browser journeys to complete...`);

  const detail = await pollGroupProgress(triggerResult.runGroupId, inputs, fetchFn, sleepFn);
  const group = detail.group;
  const runs = detail.runs || [];

  const summary = formatMarkdownSummary(detail, inputs.appUrl || 'https://traceiq.run');
  if (deps.setSummary) {
    await deps.setSummary(summary);
  }

  log(`\n========================================`);
  log(`TraceIQ Synthetic Checks Summary: ${group.status.toUpperCase()}`);
  log(`Passed: ${group.passedMonitors} / ${group.totalMonitors}`);
  for (const r of runs) {
    const icon = r.status === 'passed' ? '✓' : '✕';
    log(`  ${icon} [${r.status}] Monitor ${r.monitorId} (${r.durationMs || 0}ms)${r.failureReason ? ` - ${r.failureReason}` : ''}`);
  }
  log(`========================================\n`);

  const isPassed = group.status === 'passed';
  return {
    status: group.status,
    runGroupId: group.id,
    totalMonitors: group.totalMonitors,
    passedCount: group.passedMonitors,
    failedCount: group.failedMonitors,
    summary,
    exitCode: isPassed ? 0 : 1
  };
}

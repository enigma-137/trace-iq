import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  colors,
  logError,
  logInfo,
  logSuccess,
  logWarning,
  secretPrompt,
  selectPrompt,
  symbols
} from '../terminal/ui.js';
import {
  applyEnvVariables,
  detectExistingEnvCredentials,
  resolveFrameworkAdapter,
  resolveTargetEnvFile
} from '../adapters/detector.js';
import { ParsedArgs, flagBool, flagNumber, flagString, parseArgs } from './args.js';
import { CliError, FetchLike, LogEntry, ProjectSummary, RecentEvent, TraceIQApiClient } from './api-client.js';
import { CliConfig, ResolvedContext, loadConfig, maskToken, resolveContext, saveConfig } from './config.js';
import { formatErrorIssue, formatEventLine, formatLogLine, formatRelative, renderTable, resolveSince } from './format.js';
import { MAIN_HELP, commandHelp } from './help.js';

/**
 * Everything a command touches outside its own logic, so tests can swap it out.
 */
export interface ManageDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  out: (line?: string) => void;
  /** Resolves false to stop a --follow loop. */
  sleep: (ms: number) => Promise<boolean>;
  openUrl: (url: string) => Promise<void>;
  now: () => number;
}

export const MANAGE_COMMANDS = new Set([
  'login',
  'logout',
  'whoami',
  'projects',
  'project',
  'env',
  'logs',
  'log',
  'events',
  'errors',
  'status',
  'open',
  'keys',
  'help'
]);

interface CommandContext {
  args: ParsedArgs;
  config: CliConfig;
  ctx: ResolvedContext;
  deps: ManageDeps;
  client: () => TraceIQApiClient;
}

export function defaultDeps(): ManageDeps {
  // Ctrl+C during a --follow wait ends the loop cleanly; at any other moment
  // (e.g. mid-request) it exits like the default handler would.
  let stopped = false;
  let wake: (() => void) | null = null;
  process.once('SIGINT', () => {
    stopped = true;
    if (wake) wake();
    else process.exit(130);
  });

  return {
    cwd: process.cwd(),
    env: process.env,
    out: (line = '') => console.log(line),
    sleep: (ms) =>
      new Promise((resolve) => {
        if (stopped) return resolve(false);
        const timer = setTimeout(() => {
          wake = null;
          resolve(true);
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve(false);
        };
      }),
    openUrl,
    now: () => Date.now()
  };
}

export async function runManageCommand(command: string, rawArgs: string[], deps: ManageDeps = defaultDeps()): Promise<void> {
  const args = parseArgs(rawArgs);

  if (command === 'help') {
    const topic = args.positionals[0];
    deps.out(topic ? commandHelp(normalizeCommand(topic)) ?? MAIN_HELP : MAIN_HELP);
    return;
  }

  const normalized = normalizeCommand(command);

  if (flagBool(args.flags, 'help')) {
    deps.out(commandHelp(normalized) ?? MAIN_HELP);
    return;
  }

  const config = await loadConfig(deps.env);
  const ctx = resolveContext(
    {
      apiUrl: flagString(args.flags, 'api-url'),
      token: flagString(args.flags, 'token'),
      project: flagString(args.flags, 'project'),
      dashboardUrl: flagString(args.flags, 'dashboard-url')
    },
    config,
    deps.env
  );

  const context: CommandContext = {
    args,
    config,
    ctx,
    deps,
    client: () =>
      new TraceIQApiClient({ apiUrl: ctx.apiUrl, token: ctx.token, projectId: ctx.projectId, fetchImpl: deps.fetchImpl })
  };

  try {
    switch (normalized) {
      case 'login':
        return await login(context);
      case 'logout':
        return await logout(context);
      case 'whoami':
        return await whoami(context);
      case 'projects':
        return await projects(context);
      case 'env':
        return await env(context);
      case 'logs':
        return await logs(context);
      case 'events':
        return await events(context);
      case 'errors':
        return await errors(context);
      case 'status':
        return await status(context);
      case 'open':
        return await open(context);
      case 'keys':
        deps.out(commandHelp('keys'));
        process.exitCode = 1;
        return;
    }
  } catch (error) {
    if (error instanceof CliError) {
      logError(error.message);
      if (error.hint) logInfo(error.hint);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function normalizeCommand(command: string): string {
  if (command === 'project') return 'projects';
  if (command === 'log') return 'logs';
  return command;
}

// ─── Account ────────────────────────────────────────────────────────────────

async function login({ args, config, ctx, deps }: CommandContext) {
  let token = flagString(args.flags, 'token');

  if (!token) {
    deps.out();
    logInfo(`Create a token at ${colors.cyan(`${ctx.dashboardUrl}/dashboard/settings`)} → Personal access tokens.`);
    logInfo(`Give it ${colors.bold('projects:read')}, ${colors.bold('analytics:read')} and ${colors.bold('errors:read')}.`);
    deps.out();
    token = await secretPrompt('Paste your personal access token');
  }

  if (!token) {
    throw new CliError('No token provided.');
  }
  if (!token.startsWith('tiq_pat_')) {
    throw new CliError('That does not look like a personal access token.', 'Tokens start with tiq_pat_.');
  }

  const client = new TraceIQApiClient({ apiUrl: ctx.apiUrl, token, fetchImpl: deps.fetchImpl });
  const { projects } = await client.listProjects();

  const next: CliConfig = { ...config, token };
  const apiUrlFlag = flagString(args.flags, 'api-url');
  if (apiUrlFlag) next.apiUrl = ctx.apiUrl;
  const dashboardFlag = flagString(args.flags, 'dashboard-url');
  if (dashboardFlag) next.dashboardUrl = ctx.dashboardUrl;

  const keep = projects.find((p) => p.id === config.projectId);
  let active: ProjectSummary | undefined = keep;
  if (!active && projects.length === 1) {
    active = projects[0];
  } else if (!active && projects.length > 1) {
    deps.out();
    const id = await selectPrompt(
      'Which project should the CLI use?',
      projects.map((p) => ({ value: p.id, label: p.name, hint: `${p.organizationName} · ${p.id}` }))
    );
    active = projects.find((p) => p.id === id);
  }

  next.projectId = active?.id;
  next.projectName = active?.name;
  await saveConfig(next, deps.env);

  logSuccess(`Logged in to ${colors.bold(ctx.apiUrl)} with ${maskToken(token)}`);
  if (active) {
    logSuccess(`Active project: ${colors.bold(active.name)} ${colors.dim(`(${active.id})`)}`);
  } else {
    logWarning('This token cannot see any projects. Check that it has the projects:read scope.');
  }
}

async function logout({ config, deps }: CommandContext) {
  if (!config.token) {
    logInfo('Not logged in.');
    return;
  }
  const { token: _removed, ...rest } = config;
  await saveConfig(rest, deps.env);
  logSuccess('Removed the saved token.');
  logInfo('The token still works until you revoke it in Settings → Personal access tokens.');
}

async function whoami({ args, ctx, client, deps }: CommandContext) {
  const api = client();
  const [setup, list] = await Promise.all([api.getSetup(ctx.projectId), api.listProjects()]);
  const project = list.projects.find((p) => p.id === (ctx.projectId ?? setup.project?.id));

  if (flagBool(args.flags, 'json')) {
    deps.out(
      JSON.stringify({
        apiUrl: ctx.apiUrl,
        token: ctx.token ? maskToken(ctx.token) : null,
        tokenSource: ctx.tokenSource,
        organization: setup.organization,
        project: project ?? null,
        projectCount: list.projects.length
      })
    );
    return;
  }

  deps.out();
  deps.out(`  ${colors.dim('API')}           ${ctx.apiUrl}`);
  deps.out(`  ${colors.dim('Token')}         ${ctx.token ? maskToken(ctx.token) : '-'} ${colors.dim(`(${ctx.tokenSource})`)}`);
  if (setup.organization) {
    deps.out(`  ${colors.dim('Organization')}  ${setup.organization.name} ${colors.dim(`(${setup.organization.role})`)}`);
  }
  deps.out(
    `  ${colors.dim('Project')}       ${project ? `${colors.bold(project.name)} ${colors.dim(project.id)}` : colors.dim('none selected')}`
  );
  deps.out(`  ${colors.dim('Projects')}      ${list.projects.length} accessible`);
  deps.out();
}

// ─── Projects ───────────────────────────────────────────────────────────────

async function projects({ args, config, ctx, client, deps }: CommandContext) {
  const sub = args.positionals[0] ?? 'list';

  if (sub === 'list' || sub === 'ls') {
    const { projects } = await client().listProjects();
    if (flagBool(args.flags, 'json')) {
      deps.out(JSON.stringify(projects));
      return;
    }
    if (projects.length === 0) {
      logInfo('No projects found for this token.');
      return;
    }
    deps.out();
    renderTable(
      ['', 'NAME', 'ID', 'ORGANIZATION', 'ROLE'],
      projects.map((p) => [
        p.id === ctx.projectId ? colors.green(symbols.dot) : ' ',
        p.id === ctx.projectId ? colors.bold(p.name) : p.name,
        colors.dim(p.id),
        p.organizationName,
        p.role
      ])
    ).forEach((line) => deps.out(`  ${line}`));
    deps.out();
    return;
  }

  if (sub === 'use' || sub === 'switch' || sub === 'select') {
    const { projects } = await client().listProjects();
    if (projects.length === 0) {
      throw new CliError('No projects found for this token.');
    }

    const wanted = args.positionals[1];
    let project: ProjectSummary | undefined;
    if (wanted) {
      const lower = wanted.toLowerCase();
      project =
        projects.find((p) => p.id === wanted) ??
        projects.find((p) => p.slug === wanted) ??
        projects.find((p) => p.name.toLowerCase() === lower);
      if (!project) {
        throw new CliError(`No project matches "${wanted}".`, 'Run `traceiq projects list` to see ids and names.');
      }
    } else {
      const current = Math.max(projects.findIndex((p) => p.id === ctx.projectId), 0);
      const id = await selectPrompt(
        'Which project should the CLI use?',
        projects.map((p) => ({ value: p.id, label: p.name, hint: `${p.organizationName} · ${p.id}` })),
        current
      );
      project = projects.find((p) => p.id === id);
    }

    await saveConfig({ ...config, projectId: project!.id, projectName: project!.name }, deps.env);
    logSuccess(`Active project: ${colors.bold(project!.name)} ${colors.dim(`(${project!.id})`)}`);
    return;
  }

  if (sub === 'create' || sub === 'rename' || sub === 'delete') {
    throw new CliError(
      `Projects can't be ${sub === 'create' ? 'created' : sub === 'rename' ? 'renamed' : 'deleted'} from the CLI yet.`,
      `The API only allows this from a signed-in dashboard session. Run \`traceiq open settings\` (${ctx.dashboardUrl}/dashboard/settings).`
    );
  }

  throw new CliError(`Unknown projects command "${sub}".`, 'Run `traceiq help projects`.');
}

// ─── Env ────────────────────────────────────────────────────────────────────

const FRAMEWORK_PREFIX: Record<string, string> = {
  next: 'NEXT_PUBLIC_',
  nextjs: 'NEXT_PUBLIC_',
  vite: 'VITE_',
  'vite-react': 'VITE_',
  node: '',
  'generic-web': ''
};

export function buildEnvVars(prefix: string, values: { projectId: string; apiUrl: string; writeKey?: string }): Record<string, string> {
  const vars: Record<string, string> = {
    [`${prefix}TRACEIQ_PROJECT_ID`]: values.projectId,
    [`${prefix}TRACEIQ_API_URL`]: values.apiUrl
  };
  if (values.writeKey) vars[`${prefix}TRACEIQ_WRITE_KEY`] = values.writeKey;
  return vars;
}

async function env({ args, ctx, client, deps }: CommandContext) {
  const sub = args.positionals[0];
  if (sub !== 'pull') {
    throw new CliError(sub ? `Unknown env command "${sub}".` : 'Missing env command.', 'Run `traceiq env pull`.');
  }

  let projectId = ctx.projectId;
  if (!projectId) {
    const setup = await client().getSetup();
    projectId = setup.project?.id;
  }
  if (!projectId) {
    throw new CliError('No project selected.', 'Run `traceiq projects use` first.');
  }

  const frameworkFlag = flagString(args.flags, 'framework');
  let prefix: string;
  if (frameworkFlag) {
    if (!(frameworkFlag in FRAMEWORK_PREFIX)) {
      throw new CliError(`Unknown framework "${frameworkFlag}".`, 'Use next, vite or node.');
    }
    prefix = FRAMEWORK_PREFIX[frameworkFlag];
  } else {
    const adapter = await resolveFrameworkAdapter(deps.cwd);
    prefix = FRAMEWORK_PREFIX[adapter.frameworkId] ?? '';
  }

  const existing = await detectExistingEnvCredentials(deps.cwd);
  let writeKey = flagString(args.flags, 'write-key');
  if (!writeKey && existing.writeKey && (!existing.projectId || existing.projectId === projectId)) {
    writeKey = existing.writeKey;
  }

  const vars = buildEnvVars(prefix, { projectId, apiUrl: ctx.apiUrl, writeKey });

  if (flagBool(args.flags, 'print')) {
    for (const [key, value] of Object.entries(vars)) deps.out(`${key}=${value}`);
    return;
  }

  const file = flagString(args.flags, 'file') ?? (await resolveTargetEnvFile(deps.cwd));
  const dryRun = flagBool(args.flags, 'dry-run');
  const result = await applyEnvVariables(deps.cwd, file, vars, dryRun);

  const verb = dryRun ? 'Would update' : result.created ? 'Created' : 'Updated';
  logSuccess(`${verb} ${colors.bold(path.normalize(file))}`);
  for (const key of Object.keys(vars)) {
    deps.out(`    ${colors.green('+')} ${key}`);
  }
  if (!writeKey) {
    if (existing.writeKey) {
      logWarning(`${existing.foundInFile} still has the write key for project ${existing.projectId}, not ${projectId}.`);
    } else {
      logWarning(`${prefix}TRACEIQ_WRITE_KEY not set: the API cannot return existing write keys.`);
    }
    logInfo('Pass the key with --write-key, or rotate one in the dashboard (`traceiq open settings`).');
  }
  if (!dryRun) {
    logInfo('Restart your dev server so it picks up the change.');
  }
}

// ─── Logs ───────────────────────────────────────────────────────────────────

async function logs({ args, client, deps }: CommandContext) {
  const api = client();
  const json = flagBool(args.flags, 'json');
  const follow = flagBool(args.flags, 'follow');
  const limit = clamp(flagNumber(args.flags, 'limit') ?? 50, 1, 200);
  const intervalMs = Math.max(flagNumber(args.flags, 'interval') ?? 2, 1) * 1000;

  const sinceFlag = flagString(args.flags, 'since') ?? '1h';
  const from = resolveSince(sinceFlag, deps.now());
  if (!from) {
    throw new CliError(`Can't read --since "${sinceFlag}".`, 'Use a window like 15m, 2h, 7d or an ISO date.');
  }

  const filters = {
    level: flagString(args.flags, 'level'),
    search: flagString(args.flags, 'search'),
    source: flagString(args.flags, 'source'),
    status: flagString(args.flags, 'status'),
    traceId: flagString(args.flags, 'trace')
  };

  const print = (log: LogEntry) => deps.out(json ? JSON.stringify(log) : formatLogLine(log));

  const first = await api.getLogs({ ...filters, from, limit });
  if (!first.project) {
    throw new CliError('Project not found or not accessible with this token.', 'Run `traceiq projects use`.');
  }

  const initial = [...first.logs].reverse();
  initial.forEach(print);

  if (!json && initial.length === 0 && !follow) {
    logInfo(`No logs in ${first.project.name} since ${sinceFlag === '1h' ? 'the last hour' : sinceFlag}.`);
  }
  if (!follow) {
    if (!json && first.hasMore) {
      logInfo(colors.dim(`Showing the newest ${limit}. Narrow with --since or filters, or raise --limit (max 200).`));
    }
    return;
  }

  if (!json) {
    logInfo(colors.dim(`Following ${first.project.name}… (Ctrl+C to stop)`));
  }

  // Cursor is the newest timestamp printed; the API's `from` is inclusive, so
  // ids already printed at that timestamp are remembered and skipped.
  let cursor = initial.length > 0 ? initial[initial.length - 1].timestamp : from;
  const seen = new Map<string, string>(initial.map((log) => [log.id, log.timestamp]));

  while (await deps.sleep(intervalMs)) {
    const fresh: LogEntry[] = [];
    for (let page = 0; page < 5; page++) {
      const response = await api.getLogs({ ...filters, from: cursor, limit: 200, offset: page * 200 });
      fresh.push(...response.logs.filter((log) => !seen.has(log.id)));
      if (!response.hasMore) break;
    }

    fresh.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const log of fresh) {
      print(log);
      seen.set(log.id, log.timestamp);
    }

    if (fresh.length > 0) {
      cursor = fresh[fresh.length - 1].timestamp;
      for (const [id, timestamp] of seen) {
        if (timestamp < cursor) seen.delete(id);
      }
    }
  }
}

// ─── Events ─────────────────────────────────────────────────────────────────

async function events({ args, ctx, client, deps }: CommandContext) {
  const api = client();
  const json = flagBool(args.flags, 'json');
  const follow = flagBool(args.flags, 'follow');
  const limit = clamp(flagNumber(args.flags, 'limit') ?? 25, 1, 100);
  const intervalMs = Math.max(flagNumber(args.flags, 'interval') ?? 2, 1) * 1000;
  const name = flagString(args.flags, 'name');

  const matches = (event: RecentEvent) => !name || event.eventName === name;
  const print = (event: RecentEvent) => deps.out(json ? JSON.stringify(event) : formatEventLine(event));

  const first = await api.getRecentEvents(follow ? 100 : limit);
  if (!first.project) {
    throw new CliError('No project found for this token.', 'Run `traceiq projects use`.');
  }
  if (ctx.projectId && first.project.id !== ctx.projectId) {
    throw new CliError(
      `Project ${ctx.projectId} is not accessible with this token.`,
      'Run `traceiq projects list` to see the projects it can read.'
    );
  }

  const initial = first.events.filter(matches).slice(0, limit).reverse();
  initial.forEach(print);
  if (!json && initial.length === 0 && !follow) {
    logInfo(`No recent events in ${first.project.name}${name ? ` named ${name}` : ''}.`);
  }
  if (!follow) return;

  if (!json) {
    logInfo(colors.dim(`Following ${first.project.name}… (Ctrl+C to stop)`));
  }

  let seen = new Set(first.events.map((event) => event.id));

  while (await deps.sleep(intervalMs)) {
    const response = await api.getRecentEvents(100);
    const fresh = response.events
      .filter((event) => !seen.has(event.id))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    fresh.filter(matches).forEach(print);
    // The response is a sliding window of the newest events; anything that
    // drops out of it is older and can't come back.
    seen = new Set(response.events.map((event) => event.id));
  }
}

// ─── Errors ─────────────────────────────────────────────────────────────────

async function errors({ args, client, deps }: CommandContext) {
  const days = clamp(flagNumber(args.flags, 'days') ?? 7, 1, 90);
  const response = await client().getErrors(days);

  if (flagBool(args.flags, 'json')) {
    deps.out(JSON.stringify(response.issues));
    return;
  }
  if (!response.project) {
    throw new CliError('Project not found or not accessible with this token.', 'Run `traceiq projects use`.');
  }
  if (response.issues.length === 0) {
    logSuccess(`No errors in ${response.project.name} in the last ${days} days.`);
    return;
  }

  deps.out();
  deps.out(`  ${colors.bold(`${response.issues.length} error issues`)} ${colors.dim(`in ${response.project.name}, last ${days} days`)}`);
  deps.out();
  for (const issue of response.issues) {
    formatErrorIssue(issue, deps.now()).forEach((line) => deps.out(`  ${line}`));
  }
  deps.out();
}

// ─── Status ─────────────────────────────────────────────────────────────────

async function status({ args, ctx, client, deps }: CommandContext) {
  const api = client();
  const json = flagBool(args.flags, 'json');

  let health: { status: string; environment?: string } | null = null;
  let healthError: string | undefined;
  try {
    health = await api.health();
  } catch (error) {
    healthError = error instanceof Error ? error.message : String(error);
  }

  const result: Record<string, unknown> = { apiUrl: ctx.apiUrl, api: health?.status === 'ok' ? 'ok' : 'down' };

  if (!health) {
    if (json) {
      deps.out(JSON.stringify({ ...result, error: healthError }));
    } else {
      logError(`API unreachable at ${ctx.apiUrl}`);
      if (healthError) logInfo(colors.dim(healthError));
    }
    process.exitCode = 1;
    return;
  }

  if (!ctx.token) {
    if (json) {
      deps.out(JSON.stringify(result));
    } else {
      logSuccess(`API ${colors.bold(ctx.apiUrl)} is up`);
      logInfo('Log in (`traceiq login`) to see project ingestion status.');
    }
    return;
  }

  const overview = await api.getOverview();
  let lastLogAt: string | null = null;
  let logsNote: string | undefined;
  try {
    const recent = await api.getLogs({ from: new Date(deps.now() - 7 * 86_400_000).toISOString(), limit: 1 });
    lastLogAt = recent.logs[0]?.timestamp ?? null;
  } catch (error) {
    logsNote = error instanceof CliError ? error.message : String(error);
  }

  Object.assign(result, {
    project: overview.project ? { id: overview.project.id, name: overview.project.name } : null,
    lastEventAt: overview.lastEventAt,
    lastLogAt,
    events1h: overview.totals?.events1h ?? 0,
    events24h: overview.totals?.events24h ?? 0
  });

  if (json) {
    deps.out(JSON.stringify(result));
    return;
  }

  const now = deps.now();
  const fresh = overview.lastEventAt && now - new Date(overview.lastEventAt).getTime() < 3_600_000;

  deps.out();
  logSuccess(`API ${colors.bold(ctx.apiUrl)} is up${health.environment ? colors.dim(` (${health.environment})`) : ''}`);
  if (!overview.project) {
    logWarning('No project found for this token.');
    return;
  }
  deps.out(`  ${colors.dim('Project')}       ${colors.bold(overview.project.name)} ${colors.dim(overview.project.id)}`);
  deps.out(
    `  ${colors.dim('Last event')}    ${fresh ? colors.green(formatRelative(overview.lastEventAt, now)) : colors.yellow(formatRelative(overview.lastEventAt, now))}`
  );
  deps.out(`  ${colors.dim('Last log')}      ${logsNote ? colors.dim(logsNote) : formatRelative(lastLogAt, now)}`);
  deps.out(`  ${colors.dim('Events')}        ${overview.totals.events1h} in the last hour · ${overview.totals.events24h} in 24h`);
  deps.out();
  if (!overview.lastEventAt) {
    logInfo('No events yet. Run `npx traceiq-cli` in your app to set up the SDK.');
  }
}

// ─── Open ───────────────────────────────────────────────────────────────────

const DASHBOARD_PAGES: Record<string, string> = {
  overview: '/dashboard',
  dashboard: '/dashboard',
  logs: '/dashboard/logs',
  events: '/dashboard/events',
  errors: '/dashboard/errors',
  users: '/dashboard/users',
  web: '/dashboard/web',
  api: '/dashboard/api-performance',
  flags: '/dashboard/flags',
  replays: '/dashboard/replays',
  alerts: '/dashboard/alerts',
  settings: '/dashboard/settings',
  tokens: '/dashboard/settings',
  billing: '/dashboard/settings/billing',
  team: '/dashboard/settings/team',
  setup: '/dashboard/setup'
};

async function open({ args, ctx, deps }: CommandContext) {
  const page = args.positionals[0] ?? 'overview';
  const pathname = DASHBOARD_PAGES[page];
  if (!pathname) {
    throw new CliError(`Unknown page "${page}".`, `Pages: ${Object.keys(DASHBOARD_PAGES).join(', ')}`);
  }

  const url = `${ctx.dashboardUrl}${pathname}`;
  if (flagBool(args.flags, 'print')) {
    deps.out(url);
    return;
  }

  logInfo(`Opening ${colors.cyan(url)}`);
  try {
    await deps.openUrl(url);
  } catch {
    logWarning('Could not open a browser. Visit the URL above.');
  }
}

function openUrl(url: string): Promise<void> {
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

import { gzipSync } from 'node:zlib';
import { maskToken } from './config.js';

export class CliError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = 'CliError';
  }
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface LogEntry {
  id: string;
  projectId: string;
  timestamp: string;
  level: string | null;
  source: string | null;
  service: string | null;
  message: string;
  status: string | null;
  statusCode: number | null;
  durationMs: number | null;
  method: string | null;
  route: string | null;
  traceId: string | null;
  requestId: string | null;
  distinctId: string | null;
  environment: string | null;
  metadata: Record<string, unknown> | null;
  errorDetails: Record<string, unknown> | null;
}

export interface LogsResponse {
  project: { id: string; name: string } | null;
  logs: LogEntry[];
  hasMore: boolean;
}

export interface RecentEvent {
  id: string;
  projectId: string;
  externalUserId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  eventName: string;
  properties: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  occurredAt: string;
  receivedAt: string;
}

export interface RecentEventsResponse {
  project: ProjectSummary | null;
  events: RecentEvent[];
}

export interface ErrorIssue {
  type: string;
  message: string;
  occurrences: number;
  sessions: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
}

export interface OverviewResponse {
  project: ProjectSummary | null;
  totals: { events: number; events24h: number; events1h: number; users: number; sessions: number };
  lastEventAt: string | null;
}

export interface SetupResponse {
  hasSetup: boolean;
  organization: { id: string; name: string; slug: string; role: string; memberCount: number } | null;
  project: { id: string; organizationId: string; name: string; slug: string } | null;
}

export interface SourceMapRelease {
  release: string;
  maps: number;
  sizeBytes: number;
  updatedAt: string;
}

export interface SourceMapFile {
  file: string;
  sizeBytes: number;
  updatedAt: string;
}

export type FetchLike = typeof fetch;

export interface ApiClientOptions {
  apiUrl: string;
  token?: string;
  projectId?: string;
  fetchImpl?: FetchLike;
}

type Query = Record<string, string | number | undefined>;

/**
 * Thin client over the dashboard API, authenticated with a personal access
 * token. Every method maps to an endpoint that already accepts PATs.
 */
export class TraceIQApiClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get apiUrl(): string {
    return this.options.apiUrl;
  }

  listProjects(): Promise<{ projects: ProjectSummary[] }> {
    return this.get('/v1/dashboard/projects');
  }

  getSetup(projectId?: string): Promise<SetupResponse> {
    return this.get('/v1/setup', { projectId });
  }

  getLogs(query: Query): Promise<LogsResponse> {
    return this.get('/v1/dashboard/logs', { projectId: this.options.projectId, ...query });
  }

  getRecentEvents(limit: number): Promise<RecentEventsResponse> {
    // This endpoint picks the project from the active-project header only.
    return this.get('/v1/dashboard/events/recent', { limit });
  }

  getErrors(days: number): Promise<{ project: ProjectSummary | null; issues: ErrorIssue[]; days: number }> {
    return this.get('/v1/dashboard/errors', { projectId: this.options.projectId, days });
  }

  getOverview(): Promise<OverviewResponse> {
    return this.get('/v1/dashboard/overview', { projectId: this.options.projectId });
  }

  async health(): Promise<{ status: string; environment?: string }> {
    return this.get('/health', {}, false);
  }

  /** Uploads one map, gzipped. `file` is the minified file's path relative to the build output. */
  uploadSourceMap(release: string, file: string, content: Buffer): Promise<{ release: string; map: SourceMapFile }> {
    return this.request('PUT', '/v1/sourcemaps', { projectId: this.options.projectId, release, file }, {
      // Node's fetch sends a Buffer as-is; the DOM typings just don't list it as BodyInit.
      body: gzipSync(content) as unknown as BodyInit,
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
    });
  }

  listSourceMaps(release?: string): Promise<{
    project: { id: string; name: string };
    release?: string;
    releases?: SourceMapRelease[];
    maps?: SourceMapFile[];
  }> {
    return this.get('/v1/sourcemaps', { projectId: this.options.projectId, release });
  }

  private get<T>(pathname: string, query: Query = {}, authenticated = true): Promise<T> {
    return this.request('GET', pathname, query, { authenticated });
  }

  private async request<T>(
    method: 'GET' | 'PUT',
    pathname: string,
    query: Query = {},
    init: { authenticated?: boolean; body?: BodyInit; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const authenticated = init.authenticated ?? true;
    if (authenticated && !this.options.token) {
      throw new CliError('Not logged in.', 'Run `traceiq login` or set TRACEIQ_TOKEN.');
    }

    // Concatenate rather than resolve so an API URL with a path prefix keeps it.
    const url = new URL(this.options.apiUrl + pathname);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    if (authenticated && this.options.token) headers.Authorization = `Bearer ${this.options.token}`;
    if (this.options.projectId) headers['x-traceiq-project-id'] = this.options.projectId;

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), { method, headers, body: init.body });
    } catch (error) {
      throw new CliError(
        `Could not reach the TraceIQ API at ${this.options.apiUrl}.`,
        error instanceof Error ? error.message : undefined
      );
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    return (await response.json()) as T;
  }

  private async toError(response: Response): Promise<CliError> {
    let message = '';
    try {
      const body = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? '';
    } catch {
      // non-JSON body
    }

    if (response.status === 401) {
      const which = this.options.token ? ` (${maskToken(this.options.token)})` : '';
      return new CliError(
        `The API rejected your token${which}: ${(message || 'unauthorized').replace(/\.$/, '')}.`,
        'Create a new token in Settings → Personal access tokens, then run `traceiq login`.'
      );
    }

    if (response.status === 403) {
      const scope = /"([a-z]+:[a-z]+)"/.exec(message)?.[1];
      return new CliError(
        message || 'Forbidden.',
        scope ? `Create a token that includes the ${scope} scope, then run \`traceiq login\` again.` : undefined
      );
    }

    return new CliError(`API request failed (${response.status})${message ? `: ${message}` : ''}`);
  }
}

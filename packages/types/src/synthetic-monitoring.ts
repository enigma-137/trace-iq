export type SyntheticMonitorStatus = 'active' | 'paused' | 'archived';

export type SyntheticSchedule = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | 'manual';

export type SyntheticBrowser = 'chromium' | 'firefox' | 'webkit';

export type SyntheticRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'timed_out';

export type SyntheticStepType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'wait_for'
  | 'assert_text'
  | 'assert_visible'
  | 'assert_url'
  | 'wait_for_response';

export interface SyntheticStep {
  id?: string;
  type: SyntheticStepType;
  description?: string;
  url?: string;
  selector?: string;
  value?: string;
  timeoutMs?: number;
  statusCode?: number;
}

export interface SyntheticMonitor {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  baseUrl: string;
  status: SyntheticMonitorStatus;
  schedule: SyntheticSchedule;
  browser: SyntheticBrowser;
  viewportWidth: number;
  viewportHeight: number;
  timeoutMs: number;
  steps: SyntheticStep[];
  environment: string;
  nextRunAt?: string;
  lastRunAt?: string | null;
  lastRunStatus?: SyntheticRunStatus | null;
  lastRunDurationMs?: number | null;
  sourceType?: 'manual' | 'funnel' | 'template' | 'replay';
  sourceFunnelId?: string | null;
  sourceFunnelName?: string | null;
  sourceFunnelUpdatedAt?: string | null;
  sourceFunnelStepCount?: number | null;
  sourceReplayId?: string | null;
  sourceSessionId?: string | null;
  sourceReplayStartedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface FunnelSyntheticDraftMilestone {
  stepOrder: number;
  eventName: string;
  label: string | null;
  suggestedSteps: SyntheticStep[];
  needsConfiguration: boolean;
  notes?: string;
}

export interface FunnelSyntheticDraft {
  source: {
    type: 'funnel';
    funnelId: string;
    name: string;
    updatedAt: string;
    stepCount: number;
  };
  monitor: {
    name: string;
    baseUrl: string;
    schedule: SyntheticSchedule;
    browser: SyntheticBrowser;
  };
  milestones: FunnelSyntheticDraftMilestone[];
  initialSteps: SyntheticStep[];
}

export type SelectorConfidence = 'high' | 'medium' | 'low';

export interface ReplaySyntheticDraftStep extends SyntheticStep {
  sourceTimestamp?: number;
  relativeTimeMs?: number;
  confidence?: SelectorConfidence;
  selectorStrategy?: string;
  needsReview?: boolean;
  isMasked?: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface ReplaySyntheticDraft {
  source: {
    type: 'replay';
    replayId: string;
    sessionId: string;
    userId?: string | null;
    anonymousId?: string | null;
    startedAt: string;
    durationSeconds: number;
    initialUrl: string;
    deviceInfo?: {
      browser?: string;
      os?: string;
      deviceType?: string;
      viewport?: { width: number; height: number };
    };
  };
  monitor: {
    name: string;
    baseUrl: string;
    schedule: SyntheticSchedule;
    browser: SyntheticBrowser;
    viewportWidth: number;
    viewportHeight: number;
  };
  initialSteps: ReplaySyntheticDraftStep[];
  stats: {
    totalRawEvents: number;
    extractedStepsCount: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
    truncated: boolean;
  };
  warnings: string[];
  [key: string]: unknown;
}

export interface SyntheticStepResult {
  stepIndex: number;
  stepType: SyntheticStepType;
  description?: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  [key: string]: unknown;
}

export interface SyntheticConsoleLog {
  type: 'log' | 'info' | 'warn' | 'error';
  text: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface SyntheticNetworkRequest {
  url: string;
  method: string;
  status?: number;
  durationMs?: number;
  failed: boolean;
  failureText?: string;
  /** The target's `x-request-id` response header, when it sent one (links to Requests). */
  requestId?: string;
  [key: string]: unknown;
}

export interface SyntheticHttpError {
  url: string;
  method: string;
  status: number;
  statusText?: string;
  /** The target's `x-request-id` response header, when it sent one (links to Requests). */
  requestId?: string;
  [key: string]: unknown;
}

export interface SyntheticRun {
  id: string;
  projectId: string;
  monitorId: string;
  status: SyntheticRunStatus;
  trigger: 'scheduled' | 'manual' | 'api' | 'ci';
  targetUrl: string;
  browser: SyntheticBrowser;
  viewport: {
    width: number;
    height: number;
  };
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  failedStepIndex?: number | null;
  failureReason?: string | null;
  finalUrl?: string | null;
  stepResults: SyntheticStepResult[];
  consoleLogs: SyntheticConsoleLog[];
  networkRequests: SyntheticNetworkRequest[];
  httpErrors: SyntheticHttpError[];
  screenshotBase64?: string | null;
  runGroupId?: string | null;
  environment?: string;
  gitProvider?: string | null;
  repository?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  pullRequestNumber?: number | null;
  checkRunId?: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface SyntheticMonitorSummary extends SyntheticMonitor {
  successRate24h?: number;
  totalRuns24h?: number;
  recentRuns?: Array<{
    id: string;
    status: SyntheticRunStatus;
    durationMs: number | null;
    createdAt: string;
  }>;
}

export interface SyntheticCiRunGroup {
  id: string;
  projectId: string;
  status: SyntheticRunStatus;
  baseUrl: string;
  environment: string;
  gitProvider?: string | null;
  repository?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  pullRequestNumber?: number | null;
  idempotencyKey?: string | null;
  totalMonitors: number;
  passedMonitors: number;
  failedMonitors: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  [key: string]: unknown;
}

export interface SyntheticCiTriggerGitMetadata {
  provider?: string;
  repository?: string;
  commitSha?: string;
  branch?: string;
  pullRequest?: number;
  [key: string]: unknown;
}

export interface SyntheticCiTriggerRequest {
  projectId: string;
  monitorIds: string[];
  baseUrl: string;
  environment?: string;
  git?: SyntheticCiTriggerGitMetadata;
  idempotencyKey?: string;
  [key: string]: unknown;
}

export interface SyntheticCiTriggerResponse {
  runGroupId: string;
  status: SyntheticRunStatus;
  totalMonitors: number;
  runs: Array<{
    monitorId: string;
    monitorName: string;
    runId: string;
  }>;
  [key: string]: unknown;
}

export interface SyntheticCiGroupDetail {
  group: SyntheticCiRunGroup;
  runs: SyntheticRun[];
  [key: string]: unknown;
}


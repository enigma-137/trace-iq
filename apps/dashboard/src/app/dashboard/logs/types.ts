export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogStatus = 'success' | 'warning' | 'error' | 'info' | 'pending';
export type LogSource =
  | 'all'
  | 'api'
  | 'webhook'
  | 'ai'
  | 'alert'
  | 'error'
  | 'auth'
  | 'job'
  | 'sdk'
  | 'custom';

export interface ObservabilityLog {
  id: string;
  projectId: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  service: string;
  message: string;
  status: LogStatus;
  statusCode?: number | null;
  durationMs?: number | null;
  method?: string | null;
  route?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  distinctId?: string | null;
  actorUserId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  environment: string;
  metadata?: Record<string, unknown> | null;
  errorDetails?: Record<string, unknown> | null;
}

export interface HistogramBucket {
  timestamp: string;
  total: number;
  success: number;
  warning: number;
  error: number;
  avgDuration: number;
}

export interface HistogramSummary {
  total: number;
  success: number;
  warning: number;
  error: number;
  avgDuration: number;
  p95Duration: number;
}

export interface HistogramResponse {
  project: { id: string; name: string } | null;
  intervalSeconds: number;
  buckets: HistogramBucket[];
  summary: HistogramSummary;
  sourceCounts: Record<string, number>;
}

export interface TraceSpan {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  service: string;
  operation: string;
  status: LogStatus;
  statusCode?: number | null;
  durationMs?: number | null;
  offsetMs: number;
  traceId?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TraceWaterfallResponse {
  root: ObservabilityLog | null;
  spans: TraceSpan[];
}

export interface ObservabilityFilterState {
  timeRange: '15m' | '1h' | '6h' | '24h' | '7d' | 'custom';
  from?: string;
  to?: string;
  source: LogSource;
  level?: LogLevel | '';
  status?: LogStatus | '';
  search: string;
  method?: string;
  model?: string;
  traceId?: string;
}

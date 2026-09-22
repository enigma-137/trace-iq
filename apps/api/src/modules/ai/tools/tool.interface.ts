import { DashboardUser } from '../../auth/auth.service';

export type EvidenceType =
  | 'funnel'
  | 'error'
  | 'api_endpoint'
  | 'feature_flag'
  | 'user'
  | 'session_replay'
  | 'webhook'
  | 'alert'
  | 'retention'
  | 'event'
  | 'cohort';

export interface EvidenceItem {
  type: EvidenceType;
  id: string;
  title: string;
  url: string;
  summary?: string;
  data?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  user: DashboardUser;
  organizationId: string;
  projectId: string;
}

export interface ToolExecutionResult {
  success: boolean;
  summary: string;
  data: unknown;
  evidence: EvidenceItem[];
  error?: string;
}

export interface TraceIQToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionResult>;
}

export type InsightType =
  | 'drop_off'
  | 'retention_anomaly'
  | 'conversion_bottleneck'
  | 'device_issue';

export interface InsightGenerationContext {
  organizationId: string;
  projectId: string;
  windowStart: string;
  windowEnd: string;
}

export interface GeneratedInsight {
  id: string;
  type: InsightType;
  title: string;
  summary: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

export interface InsightGenerationService {
  generate(context: InsightGenerationContext): Promise<GeneratedInsight[]>;
}

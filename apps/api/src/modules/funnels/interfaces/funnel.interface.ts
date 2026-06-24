export interface FunnelStepDefinition {
  order: number;
  eventName: string;
  label: string;
  required?: boolean;
}

export interface FunnelDefinition {
  id: string;
  projectId: string;
  name: string;
  steps: FunnelStepDefinition[];
}

export interface FunnelResultStep {
  step: FunnelStepDefinition;
  users: number;
  conversionRateFromPrevious: number;
}

export interface FunnelAnalyticsService {
  generate(definition: FunnelDefinition): Promise<FunnelResultStep[]>;
}

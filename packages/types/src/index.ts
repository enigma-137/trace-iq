export interface TraceIQDeviceInfo {
  userAgent?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  viewport?: {
    width: number;
    height: number;
  };
}

export interface TraceIQNetworkInfo {
  ipAddress?: string;
  connectionType?: string;
  effectiveType?: string;
  country?: string;
  region?: string;
  city?: string;
}

export interface TraceIQEvent {
  id: string;
  organizationId: string;
  projectId: string;
  userId?: string;
  anonymousId?: string;
  sessionId: string;
  eventName: string;
  properties: Record<string, unknown>;
  deviceInfo?: TraceIQDeviceInfo;
  networkInfo?: TraceIQNetworkInfo;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  userId: string;
  sessionId?: string;
  eventName: string;
  label: string;
  occurredAt: string;
  properties?: Record<string, unknown>;
}

export * from './mobile-replay';
export * from './synthetic-monitoring';

// Experiment Types
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export interface ExperimentVariant {
  id: string;
  key: string;
  name: string;
  weight: number; // percentage, e.g. 50
  isControl: boolean;
  payload?: unknown;
}

export interface ExperimentAudienceRule {
  property: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
  value: string | number | boolean;
}

export interface Experiment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  status: ExperimentStatus;
  environment: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  variants: ExperimentVariant[];
  audienceFilter?: {
    rules?: ExperimentAudienceRule[];
  };
  targetPercentage: number;
  winnerVariantKey?: string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VariantResultMetric {
  variantKey: string;
  variantName: string;
  isControl: boolean;
  weight: number;
  exposures: number;
  conversions: number;
  conversionRate: number; // 0.0 to 1.0
  uplift: number | null; // percentage relative to control, e.g. +12.5%
  zScore: number | null;
  pValue: number | null;
  confidence: number | null; // e.g. 95.4%
  isSignificant: boolean;
  sampleStatus: 'insufficient_data' | 'collecting' | 'significant' | 'neutral';
}

export interface ExperimentResults {
  experimentId: string;
  primaryMetric: string;
  totalExposures: number;
  totalConversions: number;
  overallConversionRate: number;
  variants: VariantResultMetric[];
  status: ExperimentStatus;
  hasEnoughData: boolean;
  recommendedWinner?: string | null;
  timeseries?: Array<{
    date: string;
    variantKey: string;
    exposures: number;
    conversions: number;
  }>;
}

// Survey Types
export type SurveyStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived';
export type SurveyQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'short_text'
  | 'long_text'
  | 'rating_scale'
  | 'nps';

export interface SurveyChoiceOption {
  id: string;
  label: string;
  value: string;
}

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  description?: string;
  required: boolean;
  options?: SurveyChoiceOption[];
  minRating?: number; // default 1
  maxRating?: number; // default 5 or 10
  minLabel?: string;
  maxLabel?: string;
}

export interface SurveyTargeting {
  type: 'all' | 'property' | 'event';
  propertyKey?: string;
  propertyOperator?: string;
  propertyValue?: string | number | boolean;
  eventName?: string;
}

export interface Survey {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: SurveyStatus;
  environment: string;
  questions: SurveyQuestion[];
  targeting: SurveyTargeting;
  displayTrigger?: {
    type: 'immediate' | 'event' | 'delay';
    delaySeconds?: number;
    eventName?: string;
  };
  publishedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyAnswer {
  questionId: string;
  questionType: SurveyQuestionType;
  prompt: string;
  answerText?: string;
  selectedOptions?: string[];
  rating?: number;
  score?: number;
}

export interface SurveyResponseRecord {
  id: string;
  surveyId: string;
  distinctId: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  answers: SurveyAnswer[];
  metadata?: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
}

export interface SurveyQuestionDistribution {
  questionId: string;
  prompt: string;
  type: SurveyQuestionType;
  totalResponses: number;
  options?: Array<{
    optionId: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  averageRating?: number;
  npsScore?: number; // -100 to +100
  promoters?: number;
  passives?: number;
  detractors?: number;
  recentTextAnswers?: Array<{
    id: string;
    distinctId: string;
    text: string;
    occurredAt: string;
  }>;
}

export interface SurveyResults {
  surveyId: string;
  surveyName: string;
  status: SurveyStatus;
  impressionsCount: number;
  responsesCount: number;
  responseRate: number; // percentage
  completionRate: number; // percentage
  questions: SurveyQuestionDistribution[];
  recentResponses: SurveyResponseRecord[];
}


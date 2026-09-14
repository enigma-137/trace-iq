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

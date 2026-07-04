export interface IngestEventInput {
  organizationId: string;
  projectId: string;
  userId?: string;
  anonymousId?: string;
  sessionId: string;
  eventName: string;
  properties: Record<string, unknown>;
  deviceInfo?: Record<string, unknown>;
  networkInfo?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: string;
}

export interface EventIngestionResult {
  accepted: boolean;
  eventId?: string;
  validationErrors?: string[];
}

export interface EventIngestionService {
  ingest(input: IngestEventInput): Promise<EventIngestionResult>;
}

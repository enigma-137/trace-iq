import type { TraceIQEvent } from '@traceiq/types';

export interface IngestEventInput extends Omit<TraceIQEvent, 'id' | 'timestamp'> {
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

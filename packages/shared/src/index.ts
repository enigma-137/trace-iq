import type { TraceIQEvent, TimelineEvent } from '@traceiq/types';

export const TRACEIQ_RESERVED_EVENT_PREFIX = '$traceiq.';

export function toTimelineEvent(event: TraceIQEvent, label = event.eventName): TimelineEvent | null {
  if (!event.userId) {
    return null;
  }

  return {
    id: event.id,
    userId: event.userId,
    sessionId: event.sessionId,
    eventName: event.eventName,
    label,
    occurredAt: event.timestamp,
    properties: event.properties
  };
}

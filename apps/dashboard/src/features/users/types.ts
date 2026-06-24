export interface UserTimelineItemViewModel {
  id: string;
  label: string;
  occurredAt: string;
  properties?: Record<string, unknown>;
}

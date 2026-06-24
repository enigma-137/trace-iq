export interface SegmentFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number | boolean;
}

export interface RetentionQuery {
  projectId: string;
  cohortEvent: string;
  returnEvent: string;
  filters?: SegmentFilter[];
}

export interface AnalyticsService {
  calculateRetention(query: RetentionQuery): Promise<unknown>;
  segmentUsers(projectId: string, filters: SegmentFilter[]): Promise<unknown>;
}

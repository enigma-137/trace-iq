export interface ReplaySessionViewModel {
  sessionId: string;
  userId?: string;
  startedAt: string;
  durationMs?: number;
}

export interface ReplayListItem {
  id: string;
  sessionId: string;
  userId: string | null;
  anonymousId: string | null;
  identity: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  eventCount: number;
  chunkCount: number;
  compressedSizeBytes: number;
  privacyMode: 'strict' | 'balanced' | 'custom';
  status: string;
  expiresAt: string;
  entryPage: string | null;
  deviceType: string | null;
  browser: string | null;
  country: string | null;
}

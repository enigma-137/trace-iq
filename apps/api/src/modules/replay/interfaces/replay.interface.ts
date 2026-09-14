export interface ReplaySegmentPointer {
  sessionId: string;
  sequence: number;
  storageKey: string;
  capturedAt: string;
}

export interface ReplaySettings {
  enabled: boolean;
  sampleRate: number;
  maxDurationSeconds: number;
  retentionDays: number;
  privacyMode: 'strict' | 'balanced' | 'custom';
  requireConsent: boolean;
  maskSelectors: string[];
  blockSelectors: string[];
  ignoreSelectors: string[];
  selectedFunnelIds: string[];
}

export interface IngestReplayChunkRequest {
  projectId?: string;
  sessionId?: string;
  anonymousId?: string;
  userId?: string;
  sequence?: number;
  /** rrweb event array or a mobile-structural-v1 chunk object. */
  events?: unknown;
  encodedEvents?: string;
  encoding?: 'gzip-base64';
  startedAt?: string;
  endedAt?: string;
}

export type ReplayRecordingFormat = 'rrweb-json-gzip' | 'mobile-structural-v1';

export interface AuthorizeReplayUploadRequest {
  projectId?: string;
  sessionId?: string;
  replayId?: string;
  anonymousId?: string;
  userId?: string;
  consentGranted?: boolean;
  recordingFormat?: ReplayRecordingFormat;
}

export interface ReplayUploadClaims {
  version: 2;
  tokenId: string;
  projectId: string;
  organizationId: string;
  sessionId: string;
  replayId?: string;
  anonymousId?: string;
  userId?: string;
  consentGranted: boolean;
  requireConsent: boolean;
  privacyMode: ReplaySettings['privacyMode'];
  maxDurationSeconds: number;
  maxChunks: number;
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  matchedFunnelIds: string[];
  /** Absent only on grants issued before mobile replay; those are browser grants. */
  recordingFormat?: ReplayRecordingFormat;
  issuedAt: number;
  expiresAt: number;
}

export interface ReplayCaptureAdapter {
  persistSegment(segment: ReplaySegmentPointer): Promise<void>;
  getSessionSegments(sessionId: string): Promise<ReplaySegmentPointer[]>;
}

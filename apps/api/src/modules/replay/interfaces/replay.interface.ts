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
}

export interface IngestReplayChunkRequest {
  projectId?: string;
  sessionId?: string;
  anonymousId?: string;
  userId?: string;
  sequence?: number;
  events?: unknown[];
  encodedEvents?: string;
  encoding?: 'gzip-base64';
  startedAt?: string;
  endedAt?: string;
}

export interface AuthorizeReplayUploadRequest {
  projectId?: string;
  sessionId?: string;
  anonymousId?: string;
  userId?: string;
  consentGranted?: boolean;
}

export interface ReplayUploadClaims {
  version: 1;
  tokenId: string;
  projectId: string;
  organizationId: string;
  sessionId: string;
  anonymousId?: string;
  userId?: string;
  consentGranted: boolean;
  requireConsent: boolean;
  privacyMode: ReplaySettings['privacyMode'];
  maxDurationSeconds: number;
  maxChunks: number;
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  issuedAt: number;
  expiresAt: number;
}

export interface ReplayCaptureAdapter {
  persistSegment(segment: ReplaySegmentPointer): Promise<void>;
  getSessionSegments(sessionId: string): Promise<ReplaySegmentPointer[]>;
}

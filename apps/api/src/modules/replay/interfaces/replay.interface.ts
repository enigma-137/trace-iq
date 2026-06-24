export interface ReplaySegmentPointer {
  sessionId: string;
  sequence: number;
  storageKey: string;
  capturedAt: string;
}

export interface ReplayCaptureAdapter {
  persistSegment(segment: ReplaySegmentPointer): Promise<void>;
  getSessionSegments(sessionId: string): Promise<ReplaySegmentPointer[]>;
}

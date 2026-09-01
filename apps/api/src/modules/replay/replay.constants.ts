export const REPLAY_LIMITS = {
  maxRequestBytes: envLimit('REPLAY_MAX_REQUEST_BYTES', 750_000, 64_000, 1_048_576),
  maxEncodedBytes: envLimit('REPLAY_MAX_COMPRESSED_CHUNK_BYTES', 700_000, 32_000, 950_000),
  maxUncompressedChunkBytes: envLimit('REPLAY_MAX_UNCOMPRESSED_CHUNK_BYTES', 2_000_000, 64_000, 10_000_000),
  maxEventsPerChunk: envLimit('REPLAY_MAX_EVENTS_PER_CHUNK', 500, 1, 2_000),
  maxChunksPerReplay: envLimit('REPLAY_MAX_CHUNKS_PER_SESSION', 3_000, 1, 20_000),
  maxReplayBytes: envLimit('REPLAY_MAX_SESSION_BYTES', 250_000_000, 1_000_000, 2_000_000_000),
  maxReplayUncompressedBytes: envLimit('REPLAY_MAX_UNCOMPRESSED_SESSION_BYTES', 250_000_000, 1_000_000, 2_000_000_000),
  maxPlaybackPageBytes: envLimit('REPLAY_MAX_PLAYBACK_PAGE_BYTES', 8_000_000, 256_000, 25_000_000),
  maxDurationSeconds: envLimit('REPLAY_MAX_DURATION_SECONDS', 14_400, 60, 86_400),
  clockSkewMs: envLimit('REPLAY_MAX_CLOCK_SKEW_MS', 300_000, 10_000, 900_000),
  uploadTokenSeconds: envLimit('REPLAY_UPLOAD_TOKEN_SECONDS', 300, 60, 900),
  staleUploadSeconds: envLimit('REPLAY_STALE_UPLOAD_SECONDS', 900, 300, 86_400),
  storageOperationTimeoutMs: envLimit('REPLAY_STORAGE_OPERATION_TIMEOUT_MS', 30_000, 5_000, 120_000),
  signedUrlSeconds: 60
} as const;

export const REPLAY_FORMAT_VERSION = 'rrweb@2';

export type ReplayPrivacyMode = 'strict' | 'balanced' | 'custom';

function envLimit(key: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[key]);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

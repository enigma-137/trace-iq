export interface ReplayStoragePutOptions {
  contentType: string;
  contentEncoding?: string;
  ifNoneMatch?: boolean;
}

export interface ReplayStorage {
  assertReady(): Promise<void>;
  put(key: string, value: Buffer, options: ReplayStoragePutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

export const REPLAY_STORAGE = Symbol('REPLAY_STORAGE');

const REPLAY_KEY = /^[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[0-9]{6}-[0-9a-f]{12}\.json\.gz$/;

export function validateReplayStorageKey(key: string): string {
  if (!REPLAY_KEY.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error('Invalid replay storage key.');
  }
  return key;
}

import { Injectable } from '@nestjs/common';
import { REPLAY_LIMITS } from '../replay.constants';
import { ReplayStorage, ReplayStoragePutOptions, validateReplayStorageKey } from './replay-storage.interface';

interface SupabaseReplayStorageConfig {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

@Injectable()
export class SupabaseReplayStorage implements ReplayStorage {
  private readonly env: NodeJS.ProcessEnv;
  private config?: SupabaseReplayStorageConfig;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = { ...env };
  }

  async assertReady(): Promise<void> {
    this.getConfig();
  }

  async put(key: string, value: Buffer, options: ReplayStoragePutOptions): Promise<void> {
    const response = await fetch(this.objectUrl(key), {
      method: 'POST',
      headers: {
        ...this.headers(),
        'content-type': options.contentType,
        ...(options.contentEncoding ? { 'content-encoding': options.contentEncoding } : {}),
        'x-upsert': options.ifNoneMatch ? 'false' : 'true'
      },
      body: new Uint8Array(value),
      signal: AbortSignal.timeout(REPLAY_LIMITS.storageOperationTimeoutMs)
    });
    if (!response.ok) throw new Error(`Replay object upload failed (${response.status}).`);
  }

  async get(key: string): Promise<Buffer> {
    const response = await fetch(this.objectUrl(key), {
      headers: this.headers(), signal: AbortSignal.timeout(REPLAY_LIMITS.storageOperationTimeoutMs)
    });
    if (!response.ok) throw new Error(`Replay object read failed (${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(this.objectUrl(key), {
      method: 'DELETE', headers: this.headers(), signal: AbortSignal.timeout(REPLAY_LIMITS.storageOperationTimeoutMs)
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Replay object deletion failed (${response.status}).`);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    validateReplayStorageKey(key);
    const { baseUrl, bucket } = this.getConfig();
    const expiresIn = Math.max(1, Math.min(expiresInSeconds, REPLAY_LIMITS.signedUrlSeconds));
    const response = await fetch(
      `${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodePath(key)}`,
      {
        method: 'POST', headers: { ...this.headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn }), signal: AbortSignal.timeout(REPLAY_LIMITS.storageOperationTimeoutMs)
      }
    );
    if (!response.ok) throw new Error(`Replay signed URL creation failed (${response.status}).`);
    const body = await response.json() as { signedURL?: string; signedUrl?: string };
    const path = body.signedURL ?? body.signedUrl;
    if (!path) throw new Error('Replay signed URL response was malformed.');
    return path.startsWith('http') ? path : `${baseUrl}/storage/v1${path}`;
  }

  private objectUrl(key: string) {
    validateReplayStorageKey(key);
    const { baseUrl, bucket } = this.getConfig();
    return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(key)}`;
  }

  private headers() {
    const { serviceRoleKey } = this.getConfig();
    return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  }

  private getConfig(): SupabaseReplayStorageConfig {
    if (this.config) return this.config;
    const requiredKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLAY_STORAGE_BUCKET'] as const;
    const missing = requiredKeys.filter((key) => !this.env[key]?.trim());
    if (missing.length) {
      throw new Error(
        `REPLAY_STORAGE_DRIVER=supabase requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and REPLAY_STORAGE_BUCKET. Missing: ${missing.join(', ')}.`
      );
    }
    this.config = {
      baseUrl: this.env.SUPABASE_URL!.trim().replace(/\/$/, ''),
      serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      bucket: validBucket(this.env.REPLAY_STORAGE_BUCKET!.trim())
    };
    return this.config;
  }
}

function encodePath(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function validBucket(value: string) {
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(value)) throw new Error('REPLAY_STORAGE_BUCKET is invalid.');
  return value;
}

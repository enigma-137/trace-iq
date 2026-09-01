import { ReplayStorageDriver } from '../../../config/app.config';
import { FilesystemReplayStorage } from './filesystem-replay.storage';
import { ReplayStorage } from './replay-storage.interface';
import { SupabaseReplayStorage } from './supabase-replay.storage';

export function createReplayStorage(
  driver: ReplayStorageDriver,
  env: NodeJS.ProcessEnv = process.env
): ReplayStorage {
  if (driver === 'filesystem') {
    return new FilesystemReplayStorage(env.TRACEIQ_REPLAY_STORAGE_DIR || '.traceiq/session-replays');
  }
  return new SupabaseReplayStorage(env);
}

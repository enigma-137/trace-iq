import { Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ReplayStorage, ReplayStoragePutOptions, validateReplayStorageKey } from './replay-storage.interface';

@Injectable()
export class FilesystemReplayStorage implements ReplayStorage {
  private readonly root: string;
  private ready?: Promise<string>;

  constructor(root = process.env.TRACEIQ_REPLAY_STORAGE_DIR || '.traceiq/session-replays') {
    this.root = resolve(root);
  }

  async assertReady(): Promise<void> {
    await this.getReady();
  }

  async put(key: string, value: Buffer, options: ReplayStoragePutOptions): Promise<void> {
    const target = await this.resolveKey(key, true);
    if (options.ifNoneMatch && await exists(target)) throw new Error('Replay object already exists.');
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await handle.writeFile(value);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      if (options.ifNoneMatch) {
        await link(temporary, target);
        await rm(temporary, { force: true });
      } else {
        await rm(target, { force: true });
        await rename(temporary, target);
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    const target = await this.resolveKey(key, false);
    const handle = await open(target, constants.O_RDONLY | noFollowFlag());
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('Replay object is not a regular file.');
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  async delete(key: string): Promise<void> {
    let target: string;
    try {
      target = await this.resolveKey(key, false, true);
    } catch (error) {
      if (error instanceof Error && error.message === 'Replay object parent does not exist.') return;
      throw error;
    }
    if (!await exists(target)) return;
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Replay object is not a confined regular file.');
    await rm(target, { force: true });
  }

  private async prepareRoot() {
    await mkdir(this.root, { recursive: true });
    const stat = await lstat(this.root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Replay storage root must be a real directory.');
    await chmod(this.root, 0o700);
    return realpath(this.root);
  }

  private async resolveKey(key: string, createParents: boolean, allowMissingTarget = false) {
    validateReplayStorageKey(key);
    const realRoot = await this.getReady();
    const target = resolve(realRoot, key);
    this.assertWithin(realRoot, target);
    const parent = dirname(target);
    const segments = relative(realRoot, parent).split(sep).filter(Boolean);
    let current = realRoot;
    for (const segment of segments) {
      current = resolve(current, segment);
      if (!await exists(current)) {
        if (!createParents) throw new Error('Replay object parent does not exist.');
        await mkdir(current, { mode: 0o700 });
      }
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Replay storage path contains a symbolic link.');
      const actual = await realpath(current);
      this.assertWithin(realRoot, actual);
    }
    if (!allowMissingTarget && await exists(target)) {
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error('Replay storage target is a symbolic link.');
      const actual = await realpath(target);
      this.assertWithin(realRoot, actual);
    }
    return target;
  }

  private assertWithin(root: string, target: string) {
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('Replay storage key escaped its configured root.');
  }

  private getReady() {
    this.ready ??= this.prepareRoot();
    return this.ready;
  }
}

async function exists(path: string) {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function noFollowFlag() {
  return typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';

export type SyntheticArtifactType = 'screenshot' | 'trace' | 'dom_snapshot' | 'video' | 'network_log';

export interface SyntheticArtifactRecord {
  id: string;
  projectId: string;
  runId: string;
  artifactType: SyntheticArtifactType;
  storageDriver: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  [key: string]: unknown;
}

@Injectable()
export class SyntheticArtifactService {
  private readonly logger = new Logger(SyntheticArtifactService.name);
  private readonly baseStorageDir: string;

  constructor(private readonly database: DatabaseService) {
    this.baseStorageDir = resolve(process.env.TRACEIQ_SYNTHETIC_STORAGE_DIR || '.traceiq/synthetic-artifacts');
  }

  /**
   * Persists an artifact binary to storage and records metadata in Postgres.
   */
  async saveArtifact(
    projectId: string,
    runId: string,
    type: SyntheticArtifactType,
    data: Buffer,
    mimeType: string
  ): Promise<SyntheticArtifactRecord> {
    const id = `art_${randomUUID().replace(/-/g, '')}`;
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'application/zip' ? 'zip' : 'bin';
    const relativeKey = `${projectId}/${runId}/${id}.${extension}`;
    const absolutePath = resolve(this.baseStorageDir, relativeKey);

    // Ensure parent directory exists
    await mkdir(dirname(absolutePath), { recursive: true });

    // Write file securely (0o600 mode)
    const fileHandle = await open(absolutePath, 'w', 0o600);
    try {
      await fileHandle.writeFile(data);
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }

    const query = `
      INSERT INTO synthetic_run_artifacts (
        id, project_id, run_id, artifact_type, storage_driver, storage_key,
        mime_type, size_bytes, created_at
      ) VALUES ($1, $2, $3, $4, 'filesystem', $5, $6, $7, NOW())
      RETURNING
        id, project_id AS "projectId", run_id AS "runId", artifact_type AS "artifactType",
        storage_driver AS "storageDriver", storage_key AS "storageKey",
        mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"
    `;

    const result = await this.database.query<SyntheticArtifactRecord>(query, [
      id,
      projectId,
      runId,
      type,
      relativeKey,
      mimeType,
      data.length
    ]);

    return result.rows[0];
  }

  /**
   * Retrieves an artifact binary verifying project/tenant isolation.
   */
  async getArtifact(
    projectId: string,
    runId: string,
    artifactId: string
  ): Promise<{ buffer: Buffer; mimeType: string; artifact: SyntheticArtifactRecord }> {
    const query = `
      SELECT
        id, project_id AS "projectId", run_id AS "runId", artifact_type AS "artifactType",
        storage_driver AS "storageDriver", storage_key AS "storageKey",
        mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"
      FROM synthetic_run_artifacts
      WHERE id = $1 AND project_id = $2 AND run_id = $3
    `;

    const result = await this.database.query<SyntheticArtifactRecord>(query, [artifactId, projectId, runId]);
    const artifact = result.rows[0];

    if (!artifact) {
      throw new NotFoundException('Artifact not found or access denied.');
    }

    const absolutePath = resolve(this.baseStorageDir, artifact.storageKey);
    try {
      const buffer = await readFile(absolutePath);
      return { buffer, mimeType: artifact.mimeType, artifact };
    } catch (err) {
      throw new NotFoundException('Artifact binary not found in storage.');
    }
  }

  /**
   * Lists artifacts for a specific run.
   */
  async listRunArtifacts(projectId: string, runId: string): Promise<SyntheticArtifactRecord[]> {
    const query = `
      SELECT
        id, project_id AS "projectId", run_id AS "runId", artifact_type AS "artifactType",
        storage_driver AS "storageDriver", storage_key AS "storageKey",
        mime_type AS "mimeType", size_bytes AS "sizeBytes", created_at AS "createdAt"
      FROM synthetic_run_artifacts
      WHERE project_id = $1 AND run_id = $2
      ORDER BY created_at ASC
    `;

    const result = await this.database.query<SyntheticArtifactRecord>(query, [projectId, runId]);
    return result.rows;
  }

  /**
   * Deletes artifacts for a run.
   */
  async deleteRunArtifacts(projectId: string, runId: string): Promise<void> {
    const runDir = resolve(this.baseStorageDir, projectId, runId);
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`Failed to delete artifact directory for run ${runId}: ${err}`);
    }

    await this.database.query(
      `DELETE FROM synthetic_run_artifacts WHERE project_id = $1 AND run_id = $2`,
      [projectId, runId]
    );
  }
}

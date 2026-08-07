import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export type DashboardDefinition = Record<string, unknown>;

export interface CreateDashboardRequest {
  name?: string;
  definition?: unknown;
  isShared?: boolean;
  projectId?: string;
}

export interface UpdateDashboardRequest {
  name?: string;
  definition?: unknown;
  isShared?: boolean;
  projectId?: string;
}

export interface DashboardView {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  definition: DashboardDefinition;
  createdAt: string;
  updatedAt: string;
}

type DashboardRow = {
  [column: string]: unknown;
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  definition: DashboardDefinition | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: DashboardRow): DashboardView {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    isShared: row.isShared,
    definition: row.definition ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return { project: null, dashboards: [] as DashboardView[] };
    }

    const result = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE project_id = $1 AND (owner_id = $2 OR is_shared = true)
        ORDER BY created_at DESC
      `,
      [project.id, user.id]
    );

    return { project, dashboards: result.rows.map(mapRow) };
  }

  async get(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.ownerId !== user.id && !row.isShared) {
      throw new ForbiddenException('This dashboard is not shared with you.');
    }
    return mapRow(row);
  }

  async create(user: DashboardUser, body: CreateDashboardRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }

    const definition = this.normalizeDefinition(body.definition);
    const id = `dash_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO dashboards (id, project_id, name, owner_id, is_shared, definition)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [id, project.id, name, user.id, body.isShared === true, JSON.stringify(definition)]
    );

    return this.get(user, id, project.id);
  }

  async update(user: DashboardUser, id: string, body: UpdateDashboardRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    const existing = await this.database.query<DashboardRow>(
      `
        SELECT id, name, owner_id AS "ownerId", is_shared AS "isShared",
          definition, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM dashboards
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can edit this dashboard.');
    }

    const name = body.name !== undefined ? (typeof body.name === 'string' ? body.name.trim() : '') : row.name;
    if (!name) {
      throw new BadRequestException('Dashboard name is required.');
    }
    const definition = body.definition !== undefined ? this.normalizeDefinition(body.definition) : row.definition;
    const isShared = body.isShared !== undefined ? body.isShared === true : row.isShared;

    await this.database.query(
      `
        UPDATE dashboards
        SET name = $3, is_shared = $4, definition = $5::jsonb, updated_at = now()
        WHERE id = $1 AND project_id = $2
      `,
      [id, project.id, name, isShared, JSON.stringify(definition)]
    );

    return this.get(user, id, project.id);
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const existing = await this.database.query(
      `SELECT owner_id FROM dashboards WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException('Dashboard not found.');
    }
    if (row.owner_id !== user.id) {
      throw new ForbiddenException('Only the owner can delete this dashboard.');
    }
    await this.database.query(`DELETE FROM dashboards WHERE id = $1`, [id]);
    return { deleted: true };
  }

  private normalizeDefinition(raw: unknown): DashboardDefinition {
    if (raw === undefined || raw === null) {
      throw new BadRequestException('Dashboard definition is required.');
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Dashboard definition must be a JSON object.');
    }
    return raw as DashboardDefinition;
  }
}
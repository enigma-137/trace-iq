import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { FilterCondition, sanitizeFilters } from '../../common/filters';

export interface CreateCohortRequest {
  name?: string;
  filters?: unknown;
  projectId?: string;
}

type CohortRow = {
  [column: string]: unknown;
  id: string;
  name: string;
  definition: { filters?: FilterCondition[] } | null;
  createdAt: string;
};

@Injectable()
export class CohortsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return { project: null, cohorts: [] as Array<{ id: string; name: string; filters: FilterCondition[]; createdAt: string }> };
    }

    const result = await this.database.query<CohortRow>(
      `
        SELECT id, name, definition, created_at AS "createdAt"
        FROM cohorts
        WHERE project_id = $1
        ORDER BY created_at DESC
      `,
      [project.id]
    );

    return {
      project,
      cohorts: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        filters: sanitizeFilters(row.definition?.filters),
        createdAt: row.createdAt
      }))
    };
  }

  async create(user: DashboardUser, body: CreateCohortRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new BadRequestException('Cohort name is required.');
    }

    const filters = sanitizeFilters(body.filters);
    if (filters.length === 0) {
      throw new BadRequestException('Add at least one filter condition.');
    }

    const id = `coh_${randomUUID()}`;
    await this.database.query(
      `
        INSERT INTO cohorts (id, project_id, name, definition, created_by_user_id)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [id, project.id, name, JSON.stringify({ filters }), user.id]
    );

    return { id, name, filters };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query(`DELETE FROM cohorts WHERE id = $1 AND project_id = $2`, [id, project.id]);
    if (result.rowCount === 0) {
      throw new NotFoundException('Cohort not found.');
    }
    return { deleted: true };
  }
}

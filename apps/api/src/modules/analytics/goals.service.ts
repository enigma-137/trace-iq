import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export type GoalType = 'page' | 'event';

export interface CreateGoalRequest {
  name?: string;
  type?: GoalType;
  target?: string;
  projectId?: string;
}

export interface AnalyticsGoal {
  [column: string]: unknown;
  id: string;
  name: string;
  type: GoalType;
  target: string;
  createdAt: string;
}

@Injectable()
export class GoalsService {
  constructor(private readonly database: DatabaseService, private readonly projects: ProjectsService) {}

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) return { project: null, goals: [] as AnalyticsGoal[] };
    const result = await this.database.query<AnalyticsGoal>(
      `SELECT id, name, goal_type AS type, target_value AS target, created_at AS "createdAt"
       FROM analytics_goals WHERE project_id = $1 ORDER BY created_at DESC`,
      [project.id]
    );
    return { project, goals: result.rows };
  }

  async create(user: DashboardUser, body: CreateGoalRequest) {
    const project = await this.projects.requireActiveProject(user, body.projectId);
    const name = this.required(body.name, 'Goal name');
    const target = this.required(body.target, 'Goal target');
    const type = body.type === 'page' || body.type === 'event' ? body.type : null;
    if (!type) throw new BadRequestException('Goal type must be page or event.');
    if (name.length > 100 || target.length > 300) throw new BadRequestException('Goal name or target is too long.');
    const id = `gol_${randomUUID()}`;
    await this.database.query(
      `INSERT INTO analytics_goals (id, project_id, name, goal_type, target_value, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, project.id, name, type, target, user.id]
    );
    return { id, name, type, target };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query(`DELETE FROM analytics_goals WHERE id = $1 AND project_id = $2`, [id, project.id]);
    if (result.rowCount === 0) throw new NotFoundException('Goal not found.');
    return { deleted: true };
  }

  private required(value: unknown, label: string): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new BadRequestException(`${label} is required.`);
    return normalized;
  }
}

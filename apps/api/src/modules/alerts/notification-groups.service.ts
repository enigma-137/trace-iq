import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { toUniqueEmails } from '../emails/email.service';

type GroupRow = {
  [column: string]: unknown;
  id: string;
  project_id: string;
  name: string;
  member_emails: string[] | null;
};

export interface CreateGroupRequest {
  name?: string;
  memberEmails?: string[];
  projectId?: string;
}

@Injectable()
export class NotificationGroupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  async list(user: DashboardUser, projectId?: string) {
    const project = await this.projects.resolveActiveProject(user, projectId);
    if (!project) {
      return { project: null, groups: [] };
    }
    const groups = await this.database.query<GroupRow>(
      `SELECT * FROM notification_groups WHERE project_id = $1 ORDER BY name ASC`,
      [project.id]
    );
    return {
      project,
      groups: groups.rows.map((row) => ({
        id: row.id,
        name: row.name,
        memberEmails: row.member_emails ?? []
      }))
    };
  }

  async create(user: DashboardUser, body: CreateGroupRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequestException('Group name is required.');

    const memberEmails = toUniqueEmails(Array.isArray(body.memberEmails) ? body.memberEmails : []);
    if (memberEmails.length === 0) {
      throw new BadRequestException('Add at least one valid email address.');
    }

    const id = `ng_${randomUUID()}`;
    await this.database.query(
      `INSERT INTO notification_groups (id, project_id, name, member_emails, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, project.id, name, memberEmails, user.id]
    );
    return { id, name };
  }

  async update(user: DashboardUser, id: string, body: CreateGroupRequest) {
    const project = await this.projects.requireWritableProject(user, body.projectId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequestException('Group name is required.');

    const memberEmails = toUniqueEmails(Array.isArray(body.memberEmails) ? body.memberEmails : []);
    if (memberEmails.length === 0) {
      throw new BadRequestException('Add at least one valid email address.');
    }

    const result = await this.database.query(
      `UPDATE notification_groups SET name = $3, member_emails = $4, updated_at = now() WHERE id = $1 AND project_id = $2`,
      [id, project.id, name, memberEmails]
    );
    if (result.rowCount === 0) throw new NotFoundException('Notification group not found.');
    // Existing alerts that referenced this group should pick up the new membership.
    await this.database.query(
      `UPDATE alerts SET email_recipients = $3, updated_at = now()
         WHERE project_id = $2 AND $1 = ANY(notification_group_ids)`,
      [id, project.id, memberEmails]
    );
    return { id, name };
  }

  async remove(user: DashboardUser, id: string, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    const affected = await this.database.query(
      `UPDATE alerts SET notification_group_ids = array_remove(notification_group_ids, $1), updated_at = now()
         WHERE project_id = $2 AND $1 = ANY(notification_group_ids)`,
      [id, project.id]
    );
    const result = await this.database.query(
      `DELETE FROM notification_groups WHERE id = $1 AND project_id = $2`,
      [id, project.id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Notification group not found.');
    return { deleted: true, updatedAlerts: affected.rowCount };
  }

  /** Current unique members across the requested group ids (falls back to empty on miss). */
  async resolveMembers(groupIds: string[], projectId: string): Promise<string[]> {
    if (!Array.isArray(groupIds) || groupIds.length === 0) return [];
    const result = await this.database.query<GroupRow>(
      `SELECT id, member_emails FROM notification_groups WHERE id = ANY($1::text[]) AND project_id = $2`,
      [groupIds, projectId]
    );
    const emails: string[] = [];
    for (const row of result.rows) {
      emails.push(...(row.member_emails ?? []));
    }
    return toUniqueEmails(emails);
  }
}

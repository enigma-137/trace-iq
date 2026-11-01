import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DashboardUser } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

export interface OnboardingSteps {
  [column: string]: unknown;
  /** The project has received at least one event. */
  firstEvent: boolean;
  /** At least one person was identified (a user id, not just an anonymous visitor). */
  identifiedUser: boolean;
  /** A Telegram chat or Slack channel is connected and switched on for the daily brief. */
  briefChannel: boolean;
  /** The project has at least one alert. */
  alert: boolean;
}

export interface OnboardingStatus {
  project: { id: string; name: string };
  steps: OnboardingSteps;
}

// Four existence checks. Each stops at the first matching row, and events and users are
// looked up by project through their indexes, so this stays cheap on a large project.
const STEPS_SQL = `
  SELECT
    EXISTS (SELECT 1 FROM events WHERE project_id = $1) AS "firstEvent",
    EXISTS (SELECT 1 FROM users WHERE project_id = $1 AND external_id IS NOT NULL) AS "identifiedUser",
    EXISTS (SELECT 1 FROM brief_channels WHERE project_id = $1 AND enabled) AS "briefChannel",
    EXISTS (SELECT 1 FROM alerts WHERE project_id = $1) AS "alert"
`;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService
  ) {}

  /** Which of the getting-started steps this project has completed. */
  async getStatus(user: DashboardUser, projectId?: string): Promise<OnboardingStatus> {
    const project = await this.projects.requireActiveProject(user, projectId);
    const result = await this.database.query<OnboardingSteps>(STEPS_SQL, [project.id]);
    const row = result.rows[0];
    return {
      project: { id: project.id, name: project.name },
      steps: {
        firstEvent: Boolean(row?.firstEvent),
        identifiedUser: Boolean(row?.identifiedUser),
        briefChannel: Boolean(row?.briefChannel),
        alert: Boolean(row?.alert)
      }
    };
  }
}

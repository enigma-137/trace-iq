import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { CreateProjectRequest, OrganizationsService } from '../organizations/organizations.service';
import { ProjectsService, RenameProjectRequest } from './projects.service';

@Controller('v1/dashboard/projects')
export class ProjectsController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.projectsService.listAccessibleProjects(user);
  }

  /**
   * Creates an additional project inside an existing organization. Requires an
   * interactive (non-PAT) session and an owner/admin role on the organization.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Body() body: CreateProjectRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.createProjectForUser(user, body);
  }

  /**
   * Renames an existing project.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body() body: RenameProjectRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.projectsService.renameProject(user, id, body?.name);
  }

  /**
   * Permanently deletes a project and all associated project-scoped data.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    return this.projectsService.deleteProject(user, id);
  }
}

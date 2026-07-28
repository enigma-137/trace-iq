import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from './projects.service';

@Controller('v1/dashboard/projects')
export class ProjectsController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.projectsService.listAccessibleProjects(user);
  }
}

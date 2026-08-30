import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { EntitlementService } from '../billing/entitlement.service';
import { ProjectsService } from './projects.service';

@Controller('v1/dashboard/billing')
export class EntitlementsController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
    private readonly entitlements: EntitlementService
  ) {}

  @Get('entitlements')
  async getEntitlements(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'projects:read');
    const project = await this.projects.requireActiveProject(user, projectId);
    return this.entitlements.getSnapshot(project.organizationId);
  }
}


import { Body, Controller, Get, Headers, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { BootstrapSetupRequest, OrganizationsService } from './organizations.service';

@Controller('v1/setup')
export class OrganizationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  async getSetup(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.organizationsService.getSetup(user, organizationId, projectId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bootstrap')
  async bootstrapSetup(
    @Body() body: BootstrapSetupRequest,
    @Query('organizationId') organizationId?: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.bootstrapSetup(user, body, organizationId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('organization')
  async renameOrganization(
    @Body() body: BootstrapSetupRequest,
    @Query('organizationId') organizationId?: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.renameOrganization(user, body, organizationId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('write-key/regenerate')
  async regenerateWriteKey(
    @Query('projectId') projectId?: string,
    @Body('projectId') bodyProjectId?: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    return this.organizationsService.regenerateWriteKey(user, projectId || bodyProjectId);
  }
}

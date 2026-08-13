import { Body, Controller, Get, Headers, Patch, Post } from '@nestjs/common';
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
  async getSetup(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.organizationsService.getSetup(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bootstrap')
  async bootstrapSetup(
    @Body() body: BootstrapSetupRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.bootstrapSetup(user, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('organization')
  async renameOrganization(
    @Body() body: BootstrapSetupRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.renameOrganization(user, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('write-key/regenerate')
  async regenerateWriteKey(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    return this.organizationsService.regenerateWriteKey(user);
  }
}

import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { BootstrapSetupRequest, OrganizationsService } from './organizations.service';

/**
 * Organization listing + creation for the sidebar organization switcher.
 * Listing is open to any authenticated session; creating a new organization
 * requires an interactive (non-PAT) session.
 */
@Controller('v1/organizations')
export class OrganizationsSwitcherController {
  constructor(
    private readonly authService: AuthService,
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.listOrganizations(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Body() body: BootstrapSetupRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.organizationsService.createOrganizationForUser(user, body);
  }
}

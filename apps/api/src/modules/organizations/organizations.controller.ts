import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BootstrapSetupRequest, OrganizationsService } from './organizations.service';

@Controller('v1/setup')
export class OrganizationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  getSetup(@Headers('authorization') authorization?: string) {
    const user = this.authService.getDashboardUser(authorization);
    return this.organizationsService.getSetup(user);
  }

  @Post('bootstrap')
  bootstrapSetup(
    @Body() body: BootstrapSetupRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = this.authService.getDashboardUser(authorization);
    return this.organizationsService.bootstrapSetup(user, body);
  }
}


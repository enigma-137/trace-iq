import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AdminService } from './admin.service';

@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService
  ) {}

  @Get('overview')
  async overview(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.overview();
  }

  @Get('organizations')
  async organizations(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.organizations();
  }

  @Get('projects')
  async projects(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.projects();
  }

  @Get('activity')
  async activity(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.activity();
  }

  @Get('logs')
  async logs(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.logs();
  }

  @Get('timeline')
  async timeline(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.timeline();
  }
}

import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AdminService } from './admin.service';
import { GROWTH_RANGES, GrowthRange, GrowthService } from '../growth/growth.service';

@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly growthService: GrowthService
  ) {}

  /** Public-site visitors, sign-ups, sign-ins and active users over the last 7, 30 or 90 days. */
  @Get('growth')
  async growth(@Headers('authorization') authorization?: string, @Query('days') days?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    const range = GROWTH_RANGES.find((value) => String(value) === days) ?? 30;
    return this.growthService.growth(range as GrowthRange);
  }

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

  @Get('activation')
  async activation(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.activation();
  }

  @Get('timeline')
  async timeline(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.adminService.timeline();
  }
}

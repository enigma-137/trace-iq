import { Body, Controller, Get, Headers, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RevenueService } from './revenue.service';
import { RevenueSettings } from './revenue.util';

@Controller('v1/dashboard/revenue')
export class RevenueController {
  constructor(
    private readonly authService: AuthService,
    private readonly revenueService: RevenueService
  ) {}

  @Get('settings')
  async settings(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.revenueService.getSettings(user, projectId);
  }

  @Put('settings')
  async updateSettings(
    @Body() body: Partial<RevenueSettings> & { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:write');
    const { projectId, ...settings } = body ?? {};
    return this.revenueService.updateSettings(user, projectId, settings);
  }
}

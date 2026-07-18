import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AnalyticsService } from './analytics.service';

@Controller('v1/dashboard')
export class AnalyticsController {
  constructor(
    private readonly authService: AuthService,
    private readonly analyticsService: AnalyticsService
  ) {}

  @Get('overview')
  async getOverview(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.analyticsService.getOverview(user, projectId);
  }

  @Get('web')
  async getWebAnalytics(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.analyticsService.getWebAnalytics(user, days, projectId);
  }

  @Get('insights/event-names')
  async listEventNames(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.analyticsService.listEventNames(user, projectId);
  }

  @Get('insights/trends')
  async getTrends(
    @Headers('authorization') authorization?: string,
    @Query('event') event?: string,
    @Query('interval') interval?: string,
    @Query('days') days?: string,
    @Query('breakdown') breakdown?: string,
    @Query('measure') measure?: string,
    @Query('property') property?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.analyticsService.getTrends(user, { event, interval, days, breakdown, measure, property, projectId });
  }
}

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
  async getOverview(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.analyticsService.getOverview(user, projectId, organizationId);
  }

  @Get('web')
  async getWebAnalytics(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('filters') filters?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.analyticsService.getWebAnalytics(user, { days, filters, projectId });
  }

  @Get('web/realtime')
  async getWebRealtime(
    @Headers('authorization') authorization?: string,
    @Query('filters') filters?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.analyticsService.getWebRealtime(user, { filters, projectId });
  }

  @Get('api-performance')
  async getApiPerformance(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string,
    @Query('source') source?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.analyticsService.getApiPerformance(user, days, projectId, source);
  }

  @Get('insights/event-names')
  async listEventNames(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.analyticsService.listEventNames(user, projectId);
  }

  @Get('insights/event-properties')
  async listEventProperties(
    @Headers('authorization') authorization?: string,
    @Query('event') event?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.analyticsService.listEventProperties(user, event, projectId);
  }

  @Get('retention')
  async getRetention(
    @Headers('authorization') authorization?: string,
    @Query('weeks') weeks?: string,
    @Query('filters') filters?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.analyticsService.getRetention(user, { weeks, filters, projectId });
  }

  @Get('insights/trends')
  async getTrends(
    @Headers('authorization') authorization?: string,
    @Query('event') event?: string,
    @Query('interval') interval?: string,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('breakdown') breakdown?: string,
    @Query('measure') measure?: string,
    @Query('property') property?: string,
    @Query('filters') filters?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.analyticsService.getTrends(user, {
      event,
      interval,
      days,
      from,
      to,
      breakdown,
      measure,
      property,
      filters,
      projectId
    });
  }
}

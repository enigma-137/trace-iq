import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { InsightsService } from './insights.service';

@Controller('v1/dashboard/insights')
export class InsightsController {
  constructor(
    private readonly authService: AuthService,
    private readonly insightsService: InsightsService
  ) {}

  @Get('story')
  async todayStory(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.insightsService.getTodayStory(user, projectId);
  }

  @Get('now')
  async nowActivity(
    @Headers('authorization') authorization?: string,
    @Query('minutes') minutes?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.insightsService.getNowActivity(user, projectId, minutes);
  }

  @Get('digest')
  async digest(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    // Returns the digest payload for the caller's first project's organization,
    // so the dashboard can show a preview of what the email report contains.
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.insightsService.peekDigest(user, projectId);
  }
}
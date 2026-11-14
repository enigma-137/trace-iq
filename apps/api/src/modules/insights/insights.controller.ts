import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { InsightsService } from './insights.service';
import { CreateInsightRequest, ExecuteInsightQueryRequest, SavedInsightsService, UpdateInsightRequest } from './saved-insights.service';
import { FeedbackService } from '../feedback/feedback.service';

@Controller('v1/dashboard/insights')
export class InsightsController {
  constructor(
    private readonly authService: AuthService,
    private readonly insightsService: InsightsService,
    private readonly savedInsightsService: SavedInsightsService,
    private readonly feedbackService: FeedbackService
  ) {}

  /** "Request a card" from dashboards built before /v1/feedback; it lands in the admin inbox. */
  @Post('card-requests')
  async requestCard(
    @Body() body: { request?: string; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.feedbackService.create(user, { kind: 'card_request', message: body?.request, projectId: body?.projectId });
  }

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

  /** Health from recent data (failed requests, errors, failed actions), for the header and overview. */
  @Get('health')
  async health(
    @Headers('authorization') authorization?: string,
    @Query('minutes') minutes?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.insightsService.getHealth(user, projectId, minutes);
  }

  @Get('digest')
  async digest(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.insightsService.peekDigest(user, projectId);
  }

  @Get()
  async listInsights(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('tab') tab?: 'all' | 'mine' | 'pinned',
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.savedInsightsService.list(user, {
      projectId,
      search,
      type,
      tab,
      tag,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });
  }

  @Post()
  async createInsight(
    @Body() body: CreateInsightRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.savedInsightsService.create(user, body);
  }

  @Post('query')
  async executeQuery(
    @Body() body: ExecuteInsightQueryRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.savedInsightsService.executeQuery(user, body);
  }

  @Get(':id')
  async getInsight(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:read');
    return this.savedInsightsService.get(user, id, projectId);
  }

  @Put(':id')
  async updateInsight(
    @Param('id') id: string,
    @Body() body: UpdateInsightRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.savedInsightsService.update(user, id, body);
  }

  @Post(':id/duplicate')
  async duplicateInsight(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.savedInsightsService.duplicate(user, id, projectId);
  }

  @Delete(':id')
  async deleteInsight(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.savedInsightsService.remove(user, id, projectId);
  }
}
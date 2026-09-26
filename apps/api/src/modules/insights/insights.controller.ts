import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { InsightsService } from './insights.service';
import { CreateInsightRequest, ExecuteInsightQueryRequest, SavedInsightsService, UpdateInsightRequest } from './saved-insights.service';

@Controller('v1/dashboard/insights')
export class InsightsController {
  constructor(
    private readonly authService: AuthService,
    private readonly insightsService: InsightsService,
    private readonly savedInsightsService: SavedInsightsService
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
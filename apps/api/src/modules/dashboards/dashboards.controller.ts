import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
  DashboardsService,
  CreateDashboardRequest,
  CreatePublicShareRequest,
  UpdateDashboardRequest,
  AddWidgetRequest,
  UpdateWidgetRequest,
  InstantiateTemplateRequest
} from './dashboards.service';

@Controller('v1/dashboard/dashboards')
export class DashboardsController {
  constructor(
    private readonly authService: AuthService,
    private readonly dashboardsService: DashboardsService
  ) {}

  @Get('templates')
  async listTemplates(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:read');
    return this.dashboardsService.listTemplates();
  }

  @Post('template')
  async instantiateTemplate(
    @Body() body: InstantiateTemplateRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.instantiateTemplate(user, body);
  }

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('tab') tab?: 'all' | 'mine' | 'shared' | 'pinned',
    @Query('tag') tag?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:read');
    return this.dashboardsService.list(user, { projectId, search, tab, tag });
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:read');
    return this.dashboardsService.get(user, id, projectId);
  }

  @Post()
  async create(@Body() body: CreateDashboardRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.create(user, body);
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.duplicate(user, id, projectId);
  }

  @Post(':id/widgets')
  async addWidget(
    @Param('id') id: string,
    @Body() body: AddWidgetRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.addWidget(user, id, body);
  }

  @Put(':id/widgets/:widgetId')
  async updateWidget(
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateWidgetRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.updateWidget(user, id, widgetId, body);
  }

  @Delete(':id/widgets/:widgetId')
  async removeWidget(
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.removeWidget(user, id, widgetId, projectId);
  }

  @Put(':id/layout')
  async updateLayout(
    @Param('id') id: string,
    @Body() body: { widgets: Array<{ id: string; layout: Record<string, unknown>; position?: number }>; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.updateLayout(user, id, body.widgets, body.projectId);
  }

  @Get(':id/shares')
  async listShares(@Param('id') id: string, @Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:read');
    return this.dashboardsService.listPublicShares(user, id, projectId);
  }

  @Post(':id/shares')
  async createShare(@Param('id') id: string, @Body() body: CreatePublicShareRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.createPublicShare(user, id, body);
  }

  @Delete(':id/shares/:shareId')
  async revokeShare(
    @Param('id') id: string,
    @Param('shareId') shareId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.revokePublicShare(user, id, shareId, projectId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateDashboardRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.update(user, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:write');
    return this.dashboardsService.remove(user, id, projectId);
  }
}


import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DashboardsService, CreateDashboardRequest, CreatePublicShareRequest, UpdateDashboardRequest } from './dashboards.service';

@Controller('v1/dashboard/dashboards')
export class DashboardsController {
  constructor(
    private readonly authService: AuthService,
    private readonly dashboardsService: DashboardsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'dashboards:read');
    return this.dashboardsService.list(user, projectId);
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

import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateFlagRequest, FlagsService, UpdateFlagRequest } from './flags.service';

@Controller('v1/dashboard/flags')
export class FlagsController {
  constructor(
    private readonly authService: AuthService,
    private readonly flagsService: FlagsService
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('environment') environment?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.list(user, projectId, {
      environment,
      status,
      search,
      includeArchived: includeArchived === 'true'
    });
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.get(user, id, projectId);
  }

  @Post()
  async create(@Body() body: CreateFlagRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.create(user, body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateFlagRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.update(user, id, body);
  }

  @Post(':id/toggle')
  async toggle(
    @Param('id') id: string,
    @Body() body: { enabled: boolean; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.toggle(user, id, Boolean(body.enabled), body.projectId);
  }

  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @Body() body: { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.archive(user, id, body?.projectId);
  }

  @Post(':id/restore')
  async restore(
    @Param('id') id: string,
    @Body() body: { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.restore(user, id, body?.projectId);
  }

  @Post(':id/test-evaluation')
  async testEvaluation(
    @Param('id') id: string,
    @Body() body: { distinctId?: string; properties?: Record<string, unknown>; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.testEvaluation(user, id, body);
  }

  @Get(':id/analytics')
  async getAnalytics(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('days') days?: string,
    @Query('conversionEvent') conversionEvent?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.getAnalytics(user, id, { days, conversionEvent, projectId });
  }

  @Get(':id/activity')
  async getActivity(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.getActivity(user, id, projectId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.remove(user, id, projectId);
  }
}

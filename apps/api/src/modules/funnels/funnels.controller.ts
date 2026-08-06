import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateFunnelRequest, FunnelsService } from './funnels.service';

@Controller('v1/dashboard/funnels')
export class FunnelsController {
  constructor(
    private readonly authService: AuthService,
    private readonly funnelsService: FunnelsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:read');
    return this.funnelsService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateFunnelRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:write');
    return this.funnelsService.create(user, body);
  }

  @Get(':id')
  async getFunnel(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:read');
    return this.funnelsService.getFunnel(user, id, projectId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: CreateFunnelRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:write');
    return this.funnelsService.update(user, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:write');
    return this.funnelsService.remove(user, id, projectId);
  }

  @Get(':id/results')
  async getResults(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:read');
    return this.funnelsService.getResults(user, id, days, projectId);
  }

  @Get(':id/users')
  async getStepUsers(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('step') step?: string,
    @Query('status') status?: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:read');
    return this.funnelsService.getStepUsers(user, id, { step, status, days, limit, offset, projectId });
  }
}

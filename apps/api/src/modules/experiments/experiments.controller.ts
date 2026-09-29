import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
  CreateExperimentDto,
  ExperimentsService,
  UpdateExperimentDto
} from './experiments.service';
import type { ExperimentStatus } from '@traceiq/types';

@Controller('v1/dashboard/experiments')
export class ExperimentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly experimentsService: ExperimentsService
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('environment') environment?: string,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:read');
    return this.experimentsService.list(user, projectId, {
      environment,
      status,
      search
    });
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:read');
    return this.experimentsService.get(user, id, projectId);
  }

  @Post()
  async create(
    @Body() body: CreateExperimentDto,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:write');
    return this.experimentsService.create(user, body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateExperimentDto,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:write');
    return this.experimentsService.update(user, id, body, projectId);
  }

  @Post(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: ExperimentStatus; winnerVariantKey?: string; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:write');
    return this.experimentsService.updateStatus(user, id, body.status, body.winnerVariantKey, body.projectId);
  }

  @Get(':id/results')
  async getResults(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:read');
    return this.experimentsService.getResults(user, id, projectId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'experiments:write');
    return this.experimentsService.remove(user, id, projectId);
  }
}

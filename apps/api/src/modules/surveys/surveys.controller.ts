import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateSurveyDto, SurveysService, UpdateSurveyDto } from './surveys.service';
import type { SurveyStatus } from '@traceiq/types';

@Controller('v1/dashboard/surveys')
export class SurveysController {
  constructor(
    private readonly authService: AuthService,
    private readonly surveysService: SurveysService
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
    this.authService.requireScope(user, 'surveys:read');
    return this.surveysService.list(user, projectId, {
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
    this.authService.requireScope(user, 'surveys:read');
    return this.surveysService.get(user, id, projectId);
  }

  @Post()
  async create(
    @Body() body: CreateSurveyDto,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'surveys:write');
    return this.surveysService.create(user, body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSurveyDto,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'surveys:write');
    return this.surveysService.update(user, id, body, projectId);
  }

  @Post(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: SurveyStatus; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'surveys:write');
    return this.surveysService.updateStatus(user, id, body.status, body.projectId);
  }

  @Get(':id/results')
  async getResults(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'surveys:read');
    return this.surveysService.getResults(user, id, projectId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'surveys:write');
    return this.surveysService.remove(user, id, projectId);
  }
}

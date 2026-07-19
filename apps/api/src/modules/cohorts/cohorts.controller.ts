import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CohortsService, CreateCohortRequest } from './cohorts.service';

@Controller('v1/dashboard/cohorts')
export class CohortsController {
  constructor(
    private readonly authService: AuthService,
    private readonly cohortsService: CohortsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.cohortsService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateCohortRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.cohortsService.create(user, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.cohortsService.remove(user, id, projectId);
  }
}

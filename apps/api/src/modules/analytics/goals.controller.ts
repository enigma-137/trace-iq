import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateGoalRequest, GoalsService } from './goals.service';

@Controller('v1/dashboard/web/goals')
export class GoalsController {
  constructor(private readonly auth: AuthService, private readonly goals: GoalsService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:read');
    return this.goals.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateGoalRequest, @Headers('authorization') authorization?: string) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:write');
    return this.goals.create(user, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:write');
    return this.goals.remove(user, id, projectId);
  }
}

import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { GroupsService } from './groups.service';

@Controller('v1/dashboard/groups')
export class GroupsController {
  constructor(
    private readonly authService: AuthService,
    private readonly groupsService: GroupsService
  ) {}

  @Get()
  async listGroups(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('search') search?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.groupsService.listGroups(user, { days, search, projectId });
  }

  @Get(':key')
  async getGroup(
    @Param('key') key: string,
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.groupsService.getGroup(user, key, { days, projectId });
  }
}

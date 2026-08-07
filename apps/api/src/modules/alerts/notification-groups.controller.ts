import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateGroupRequest, NotificationGroupsService } from './notification-groups.service';

@Controller('v1/dashboard/notification-groups')
export class NotificationGroupsController {
  constructor(
    private readonly authService: AuthService,
    private readonly groupsService: NotificationGroupsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:read');
    return this.groupsService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateGroupRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.groupsService.create(user, body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: CreateGroupRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.groupsService.update(user, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.groupsService.remove(user, id, projectId);
  }
}
import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

@Controller('v1/dashboard/users')
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Get()
  async listPersons(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.usersService.listPersons(user, { search, limit, offset, projectId });
  }

  @Get('search')
  async searchPersons(
    @Headers('authorization') authorization?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.usersService.searchPersons(user, { search: q ?? search, limit, cursor, offset, projectId });
  }

  @Post('resolve')
  async resolveUsers(
    @Headers('authorization') authorization?: string,
    @Body() body?: { distinctIds?: string[]; projectId?: string },
    @Query('projectId') projectIdQuery?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    const distinctIds = Array.isArray(body?.distinctIds) ? body.distinctIds : [];
    const projectId = body?.projectId || projectIdQuery;
    return this.usersService.resolveUsersByIds(user, distinctIds, projectId);
  }

  @Get(':id')
  async getPerson(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.usersService.getPerson(user, id, projectId);
  }

  @Get(':id/timeline')
  async getTimeline(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'users:read');
    return this.usersService.getTimeline(user, id, { limit, offset, projectId });
  }
}

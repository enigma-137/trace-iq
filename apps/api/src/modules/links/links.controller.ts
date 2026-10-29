import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { LinkInput, LinksService } from './links.service';

@Controller('v1/dashboard/links')
export class LinksController {
  constructor(
    private readonly authService: AuthService,
    private readonly linksService: LinksService
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('includeArchived') includeArchived?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:read');
    return this.linksService.list(user, projectId, includeArchived === 'true');
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('days') days?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:read');
    return this.linksService.get(user, id, projectId, Number(days ?? 30));
  }

  @Post()
  async create(@Body() body: LinkInput, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:write');
    return this.linksService.create(user, body ?? {});
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: LinkInput, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:write');
    return this.linksService.update(user, id, body ?? {});
  }

  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @Body() body: { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:write');
    return this.linksService.setArchived(user, id, true, body?.projectId);
  }

  @Post(':id/restore')
  async restore(
    @Param('id') id: string,
    @Body() body: { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:write');
    return this.linksService.setArchived(user, id, false, body?.projectId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'links:write');
    return this.linksService.remove(user, id, projectId);
  }
}

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
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:read');
    return this.flagsService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateFlagRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.create(user, body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateFlagRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'flags:write');
    return this.flagsService.update(user, id, body);
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


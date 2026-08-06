import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AlertsService, CreateAlertRequest } from './alerts.service';

@Controller('v1/dashboard/alerts')
export class AlertsController {
  constructor(
    private readonly authService: AuthService,
    private readonly alertsService: AlertsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:read');
    return this.alertsService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateAlertRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.alertsService.create(user, body);
  }

  @Put(':id')
  async setEnabled(
    @Param('id') id: string,
    @Body() body: { enabled?: boolean; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.alertsService.setEnabled(user, id, Boolean(body.enabled), body.projectId);
  }

  @Post(':id/test')
  async test(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.alertsService.test(user, id, projectId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'alerts:write');
    return this.alertsService.remove(user, id, projectId);
  }
}

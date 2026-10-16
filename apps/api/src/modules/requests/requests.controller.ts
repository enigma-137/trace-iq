import { Body, Controller, Get, Headers, Param, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CaptureSettings } from './request-capture';
import { RequestsQuery, RequestsService } from './requests.service';

@Controller('v1/dashboard/requests')
export class RequestsController {
  constructor(
    private readonly authService: AuthService,
    private readonly requests: RequestsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query() query?: RequestsQuery) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.list(user, query ?? {});
  }

  @Get('summary')
  async summary(@Headers('authorization') authorization?: string, @Query() query?: RequestsQuery) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.summary(user, query ?? {});
  }

  @Get('facets')
  async facets(@Headers('authorization') authorization?: string, @Query() query?: RequestsQuery) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.facets(user, query ?? {});
  }

  @Get('capture-settings')
  async getCaptureSettings(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.getCaptureSettings(user, projectId);
  }

  @Put('capture-settings')
  async updateCaptureSettings(
    @Headers('authorization') authorization?: string,
    @Body() body?: Partial<CaptureSettings> & { projectId?: string }
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.requests.updateCaptureSettings(user, body ?? {});
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return { request: await this.requests.detail(user, id, projectId) };
  }

  @Get(':id/timeline')
  async timeline(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.timeline(user, id, projectId);
  }

  @Get(':id/related')
  async related(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.requests.related(user, id, projectId);
  }
}

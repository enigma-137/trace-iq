import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { CreateIncidentBody, IncidentUpdateBody, StatusPageSettingsBody, StatusPagesService } from './status-pages.service';
import { StatusSubscribersService } from './status-subscribers.service';

@Controller('v1/dashboard/status-page')
export class StatusPagesController {
  constructor(
    private readonly authService: AuthService,
    private readonly statusPages: StatusPagesService
  ) {}

  @Get()
  async get(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'status_pages:read');
    return this.statusPages.getSettings(user, projectId);
  }

  @Put()
  async save(@Headers('authorization') authorization?: string, @Body() body?: StatusPageSettingsBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'status_pages:write');
    return this.statusPages.saveSettings(user, body ?? {});
  }

  @Post('incidents')
  async createIncident(@Headers('authorization') authorization?: string, @Body() body?: CreateIncidentBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'status_pages:write');
    return this.statusPages.createIncident(user, body ?? {});
  }

  @Post('incidents/:id/updates')
  async addUpdate(@Param('id') id: string, @Headers('authorization') authorization?: string, @Body() body?: IncidentUpdateBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'status_pages:write');
    return this.statusPages.addUpdate(user, id, body ?? {});
  }

  @Delete('incidents/:id')
  async deleteIncident(@Param('id') id: string, @Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'status_pages:write');
    return this.statusPages.deleteIncident(user, id, projectId);
  }
}

/** Public, unauthenticated: the data behind traceiq.run/status/<slug>. */
@Controller('v1/status/pages')
export class PublicStatusPagesController {
  constructor(
    private readonly statusPages: StatusPagesService,
    private readonly subscribers: StatusSubscribersService
  ) {}

  @Get(':slug')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=30')
  get(@Param('slug') slug: string) {
    return this.statusPages.getPublicPage(slug);
  }

  /** Sign-up from the status page; emails a confirmation link. */
  @Post(':slug/subscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  subscribe(@Param('slug') slug: string, @Body() body?: { email?: unknown }) {
    return this.subscribers.subscribe(slug, body?.email);
  }
}

/** Public, unauthenticated: the confirm and unsubscribe links in status page emails. */
@Controller('v1/status/subscribers')
export class StatusSubscribersController {
  constructor(private readonly subscribers: StatusSubscribersService) {}

  @Post('confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(@Body() body?: { token?: unknown }) {
    return this.subscribers.confirm(body?.token);
  }

  /** The link's page posts { token }; mail apps' one-click button posts with ?token=. */
  @Post('unsubscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  unsubscribe(@Body() body?: { token?: unknown }, @Query('token') token?: string) {
    return this.subscribers.unsubscribe(typeof body?.token === 'string' ? body.token : token);
  }
}

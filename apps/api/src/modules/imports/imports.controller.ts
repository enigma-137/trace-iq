import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { ImportEventsBody, ImportsService, PostHogImportBody } from './imports.service';

@Controller('v1/dashboard/import')
export class ImportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly importsService: ImportsService
  ) {}

  /** One chunk (≤500 events) of a file import. */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('events')
  async importEvents(@Headers('authorization') authorization?: string, @Body() body?: ImportEventsBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.importEvents(user, body ?? {});
  }

  /** Checks a PostHog key/project without starting (and paying for) an export. */
  @Post('posthog/check')
  async checkPostHog(@Headers('authorization') authorization?: string, @Body() body?: PostHogImportBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.checkPostHog(user, body ?? {});
  }

  @Post('posthog')
  async startPostHog(@Headers('authorization') authorization?: string, @Body() body?: PostHogImportBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.startPostHogImport(user, body ?? {});
  }

  @Get('jobs')
  async listJobs(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.listJobs(user, projectId);
  }

  @Post('jobs/:id/cancel')
  async cancelJob(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.cancelJob(user, id, projectId);
  }
}

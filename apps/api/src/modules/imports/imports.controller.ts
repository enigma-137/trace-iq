import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, DashboardUser } from '../auth/auth.service';
import { FinishFileImportBody, ImportEventsBody, ImportsService, PostHogImportBody, StartFileImportBody } from './imports.service';

@Controller('v1/dashboard/import')
export class ImportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly importsService: ImportsService
  ) {}

  /**
   * Importing writes history into a project, so a dashboard session must have passed
   * 2FA in the last 15 minutes when the account has it set up. Personal access tokens
   * (the CLI) are let through: creating one already requires that check.
   */
  private requireImportStepUp(user: DashboardUser) {
    if (user.authMethod !== 'pat') this.authService.requireStepUpIfEnrolled(user);
  }

  /** Starts the record of a file upload; its chunks are then sent to POST events with importId. */
  @Post('files')
  async startFileImport(@Headers('authorization') authorization?: string, @Body() body?: StartFileImportBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    this.requireImportStepUp(user);
    return this.importsService.startFileImport(user, body ?? {});
  }

  @Post('files/:id/finish')
  async finishFileImport(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Body() body?: FinishFileImportBody
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    return this.importsService.finishFileImport(user, id, body ?? {});
  }

  /** One chunk (≤500 events) of a file import. */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('events')
  async importEvents(@Headers('authorization') authorization?: string, @Body() body?: ImportEventsBody) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'imports:write');
    // Chunks of a started file import were checked when it started, so a long upload
    // isn't cut off when the 15 minutes run out. A chunk sent on its own is checked here.
    if (!body?.importId) this.requireImportStepUp(user);
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
    this.requireImportStepUp(user);
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

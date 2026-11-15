import { Body, Controller, Delete, Get, Headers, Param, Put, Query, Redirect } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { LinearService } from './linear.service';

/**
 * Linear integration. Every route except the OAuth callback needs a dashboard
 * session; the callback is trusted through its signed `state` instead.
 * Organization is chosen by `organizationId` or `projectId` (first org otherwise).
 */
@Controller('v1/integrations/linear')
export class LinearController {
  constructor(
    private readonly authService: AuthService,
    private readonly linear: LinearService
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('connect')
  async connect(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.linear.createConnectUrl(user, { organizationId, projectId });
  }

  /** Linear redirects the browser here after consent; we send it on to dashboard settings. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('callback')
  @Redirect()
  async callback(@Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    return { url: await this.linear.finishConnect({ code, state, error }), statusCode: 302 };
  }

  @Get('status')
  async status(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.linear.getStatus(user, { organizationId, projectId });
  }

  @Get('teams/:teamId/labels')
  async labels(
    @Param('teamId') teamId: string,
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.linear.listLabels(user, teamId, { organizationId, projectId });
  }

  @Delete()
  async disconnect(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.linear.disconnect(user, { organizationId, projectId });
  }

  @Put('projects/:projectId')
  async saveProject(
    @Param('projectId') projectId: string,
    @Body() body: { teamId?: unknown; labelId?: unknown },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.linear.saveProjectSettings(user, projectId, body ?? {});
  }
}

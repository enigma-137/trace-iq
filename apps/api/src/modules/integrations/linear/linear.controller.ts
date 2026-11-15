import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Redirect, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { LinearService } from './linear.service';
import { LinearWebhookService, verifyLinearWebhook } from './linear-webhook.service';

/**
 * Linear integration. Every route except the OAuth callback needs a dashboard
 * session. The callback stores nothing: it forwards the code to the dashboard.
 * Organization is chosen by `organizationId` or `projectId` (first org otherwise).
 */
@Controller('v1/integrations/linear')
export class LinearController {
  constructor(
    private readonly authService: AuthService,
    private readonly linear: LinearService,
    private readonly webhooks: LinearWebhookService
  ) {}

  /**
   * Linear posts issue changes here (configured on the OAuth app, signed with
   * LINEAR_WEBHOOK_SECRET). Unknown or unlinked issues are acknowledged and ignored
   * so Linear does not retry them.
   */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('linear-signature') signature?: string,
    @Headers('linear-delivery') deliveryId?: string
  ) {
    const payload = verifyLinearWebhook(this.webhooks.secret, request.rawBody ?? Buffer.alloc(0), signature);
    const outcome = await this.webhooks.handle(payload);
    this.webhooks.logOutcome(outcome, deliveryId);
    return { ok: true, outcome };
  }

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

  /**
   * Linear redirects the browser here after consent. The code is only forwarded to
   * dashboard settings, which finishes the connection with the signed-in session.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('callback')
  @Redirect()
  callback(@Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    return { url: this.linear.forwardCallback({ code, state, error }), statusCode: 302 };
  }

  /** The dashboard posts the forwarded code here; only the person who started may finish. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('complete')
  @HttpCode(200)
  async complete(@Body() body: { code?: unknown; state?: unknown }, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.linear.completeConnect(user, body ?? {});
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
    @Body() body: { teamId?: unknown; labelId?: unknown; autoCreate?: unknown },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.linear.saveProjectSettings(user, projectId, body ?? {});
  }
}

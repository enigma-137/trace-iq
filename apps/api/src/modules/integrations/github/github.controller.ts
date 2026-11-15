import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Redirect, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { GitHubService } from './github.service';
import { GitHubWebhookService, verifyGitHubWebhook } from './github-webhook.service';
import { GitHubSetupService } from './setup/github-setup.service';

/**
 * TraceIQ GitHub App (separate from GitHub sign-in). Dashboard routes need a session;
 * the callback stores nothing and the webhook is verified by its signature.
 * Organization is chosen by `organizationId` or `projectId` (first org otherwise).
 */
@Controller('v1/integrations/github')
export class GitHubController {
  constructor(
    private readonly authService: AuthService,
    private readonly github: GitHubService,
    private readonly webhooks: GitHubWebhookService,
    private readonly setup: GitHubSetupService
  ) {}

  /** What the setup PR would contain: detected stack, files, env vars. Writes nothing. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('projects/:projectId/setup-preview')
  async setupPreview(@Param('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.setup.preview(user, projectId);
  }

  /** Opens (or returns the open) TraceIQ setup pull request on the `traceiq/setup` branch. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('projects/:projectId/setup-pr')
  @HttpCode(200)
  async setupPullRequest(@Param('projectId') projectId: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.setup.createSetupPullRequest(user, projectId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('install')
  async install(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string,
    @Query('returnTo') returnTo?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.github.createInstallUrl(user, { organizationId, projectId }, returnTo);
  }

  /** GitHub's "Callback URL" after installing. Forwards to the dashboard; stores nothing. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('callback')
  @Redirect()
  callback(
    @Query('installation_id') installationId?: string,
    @Query('setup_action') setupAction?: string,
    @Query('code') code?: string,
    @Query('state') state?: string
  ) {
    return { url: this.github.forwardCallback({ installation_id: installationId, setup_action: setupAction, code, state }), statusCode: 302 };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('complete')
  @HttpCode(200)
  async complete(
    @Body() body: { installationId?: unknown; code?: unknown; state?: unknown },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.github.completeInstall(user, body ?? {});
  }

  @Get('status')
  async status(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.github.getStatus(user, { organizationId, projectId });
  }

  @Get('repos')
  async repos(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'projects:read');
    return this.github.listRepos(user, { organizationId, projectId });
  }

  @Put('projects/:projectId')
  async linkProject(
    @Param('projectId') projectId: string,
    @Body() body: { repoFullName?: unknown; subdirectory?: unknown },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.github.linkProjectRepo(user, projectId, body ?? {});
  }

  @Delete()
  async disconnect(
    @Headers('authorization') authorization?: string,
    @Query('organizationId') organizationId?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.github.disconnect(user, { organizationId, projectId });
  }

  /** GitHub App webhook: installation and installation_repositories events. */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-event') event?: string,
    @Headers('x-github-delivery') deliveryId?: string
  ) {
    const payload = verifyGitHubWebhook(this.webhooks.secret, request.rawBody ?? Buffer.alloc(0), signature);
    const outcome = await this.webhooks.handle(event, payload);
    this.webhooks.logOutcome(outcome, deliveryId);
    return { ok: true, outcome };
  }
}

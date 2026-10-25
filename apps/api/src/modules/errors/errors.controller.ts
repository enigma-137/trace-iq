import { Body, Controller, Get, Headers, Param, Patch, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { ErrorsService, UpdateIssueRequest } from './errors.service';

@Controller('v1/dashboard/errors')
export class ErrorsController {
  constructor(
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService
  ) {}

  @Get()
  async listIssues(
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('release') release?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:read');
    return this.errorsService.listIssues(user, days, projectId, status, release);
  }

  @Get('issue')
  async getIssue(
    @Headers('authorization') authorization?: string,
    @Query('id') id?: string,
    @Query('type') type?: string,
    @Query('message') message?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:read');
    return this.errorsService.getIssue(user, { id, type, message, days, projectId });
  }

  /** Resolve, ignore, reopen or (un)assign an issue. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch('issues/:id')
  async updateIssue(
    @Param('id') id: string,
    @Body() body: UpdateIssueRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:write');
    return this.errorsService.updateIssue(user, id, body ?? {});
  }
}

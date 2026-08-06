import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ErrorsService } from './errors.service';

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
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:read');
    return this.errorsService.listIssues(user, days, projectId);
  }

  @Get('issue')
  async getIssue(
    @Headers('authorization') authorization?: string,
    @Query('type') type?: string,
    @Query('message') message?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:read');
    return this.errorsService.getIssue(user, { type, message, days, projectId });
  }
}

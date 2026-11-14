import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { FeedbackService } from './feedback.service';

/** Anyone signed in to the dashboard can send feedback. */
@Controller('v1/feedback')
export class FeedbackController {
  constructor(
    private readonly authService: AuthService,
    private readonly feedbackService: FeedbackService
  ) {}

  @Post()
  async create(
    @Body() body: { kind?: string; message?: string; projectId?: string; page?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'insights:write');
    return this.feedbackService.create(user, body ?? {});
  }
}

/** The platform admin inbox and its bell. */
@Controller('v1/admin/feedback')
export class AdminFeedbackController {
  constructor(
    private readonly authService: AuthService,
    private readonly feedbackService: FeedbackService
  ) {}

  @Get()
  async inbox(
    @Headers('authorization') authorization?: string,
    @Query('unread') unread?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.feedbackService.inbox({ unread: unread === 'true', kind, limit: limit ? Number(limit) : undefined });
  }

  @Get('unread-count')
  async unreadCount(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.feedbackService.unreadCount();
  }

  @Post('read-all')
  async markAllRead(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.feedbackService.markAllRead();
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { read?: boolean; status?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return this.feedbackService.update(id, body ?? {});
  }
}

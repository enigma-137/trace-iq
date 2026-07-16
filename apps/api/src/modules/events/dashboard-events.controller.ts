import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { EventsService } from './events.service';

@Controller('v1/dashboard/events')
export class DashboardEventsController {
  constructor(
    private readonly authService: AuthService,
    private readonly eventsService: EventsService
  ) {}

  @Get('recent')
  async listRecentEvents(@Headers('authorization') authorization?: string, @Query('limit') limit?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.eventsService.listDashboardRecentEvents(user, limit ? Number(limit) : undefined);
  }
}

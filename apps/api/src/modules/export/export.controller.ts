import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ExportService } from './export.service';

@Controller('v1/dashboard/export')
export class ExportController {
  constructor(
    private readonly authService: AuthService,
    private readonly exportService: ExportService
  ) {}

  @Get('events')
  async exportEvents(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('event') event?: string,
    @Query('limit') limit?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.exportService.exportEvents(user, { projectId, from, to, event, limit });
  }
}

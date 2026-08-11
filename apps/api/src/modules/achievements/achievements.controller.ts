import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AchievementsService } from './achievements.service';

@Controller('v1/dashboard/achievements')
export class AchievementsController {
  constructor(
    private readonly authService: AuthService,
    private readonly achievementsService: AchievementsService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.achievementsService.list(user, projectId);
  }
}

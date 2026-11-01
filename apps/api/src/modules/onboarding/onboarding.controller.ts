import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { OnboardingService } from './onboarding.service';

@Controller('v1/dashboard/onboarding')
export class OnboardingController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboarding: OnboardingService
  ) {}

  @Get()
  async status(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.onboarding.getStatus(user, projectId);
  }
}

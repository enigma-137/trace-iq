import { Controller, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { AiService } from './ai.service';

@Controller('v1/dashboard/ai')
export class AiController {
  constructor(
    private readonly authService: AuthService,
    private readonly aiService: AiService
  ) {}

  @Post('funnels/:id/summary')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async summarizeFunnel(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('days') days?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'funnels:read');
    return this.aiService.summarizeFunnelDropOff(user, id, days, projectId);
  }
}

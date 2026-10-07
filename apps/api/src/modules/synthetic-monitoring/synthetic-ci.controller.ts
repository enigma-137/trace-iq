import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';
import type { SyntheticCiTriggerRequest } from '@traceiq/types';

@Controller('v1/synthetic/ci-runs')
export class SyntheticCiController {
  constructor(
    private readonly authService: AuthService,
    private readonly syntheticService: SyntheticMonitoringService
  ) {}

  /**
   * Triggers one or more synthetic monitors against a pull request preview deployment URL.
   */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post()
  async trigger(
    @Body() body: SyntheticCiTriggerRequest,
    @Headers('authorization') authorization?: string,
    @Headers('x-traceiq-api-key') apiKeyHeader?: string,
    @Headers('x-traceiq-write-key') writeKeyHeader?: string
  ) {
    const caller = await this.syntheticService.authenticateCiCaller(
      authorization,
      apiKeyHeader,
      writeKeyHeader,
      body.projectId
    );
    return this.syntheticService.triggerCiRuns(caller, body);
  }

  /**
   * Polling endpoint for CI / GitHub Actions to check aggregated group progress and run results.
   */
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Get(':groupId')
  async getStatus(
    @Param('groupId') groupId: string,
    @Query('projectId') projectId?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-traceiq-api-key') apiKeyHeader?: string,
    @Headers('x-traceiq-write-key') writeKeyHeader?: string
  ) {
    const caller = await this.syntheticService.authenticateCiCaller(
      authorization,
      apiKeyHeader,
      writeKeyHeader,
      projectId
    );
    return this.syntheticService.getCiRunGroup(caller, groupId);
  }
}

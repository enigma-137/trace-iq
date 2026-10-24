import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  NotFoundException,
  Param,
  Post,
  Query
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import {
  LogsQuery,
  ObservabilityService
} from './observability.service';

export interface IngestLogDto {
  projectId?: string;
  writeKey?: string;
  level?: string;
  source?: string;
  service?: string;
  message: string;
  status?: string;
  statusCode?: number;
  durationMs?: number;
  method?: string;
  route?: string;
  traceId?: string;
  requestId?: string;
  sessionId?: string;
  distinctId?: string;
  actorUserId?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  environment?: string;
  metadata?: Record<string, unknown>;
  errorDetails?: Record<string, unknown>;
}

@Controller()
export class ObservabilityController {
  constructor(
    private readonly authService: AuthService,
    private readonly observabilityService: ObservabilityService
  ) {}

  @Get('v1/dashboard/logs')
  async getLogs(
    @Headers('authorization') authorization?: string,
    @Query() query?: LogsQuery
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.observabilityService.getLogs(user, query ?? {});
  }

  @Get('v1/dashboard/logs/histogram')
  async getHistogram(
    @Headers('authorization') authorization?: string,
    @Query() query?: LogsQuery
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.observabilityService.getHistogram(user, query ?? {});
  }

  @Get('v1/dashboard/logs/:id')
  async getLogDetail(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    const log = await this.observabilityService.getLogDetail(user, id, projectId);
    if (!log) {
      throw new NotFoundException('Log entry not found.');
    }
    return { log };
  }

  @Get('v1/dashboard/logs/:id/trace')
  async getTrace(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.observabilityService.getTrace(user, id, projectId);
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('v1/logs/batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestLogBatch(
    @Body() body: { projectId?: string; writeKey?: string; logs?: unknown },
    @Headers('x-traceiq-write-key') writeKey?: string
  ) {
    return this.observabilityService.ingestLogBatchFromSdk(body ?? {}, writeKey);
  }

  @Throttle({ default: { limit: 1_000, ttl: 60_000 } })
  @Post('v1/logs')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestLog(
    @Body() body: IngestLogDto,
    @Headers() headers: Record<string, string | undefined>,
    @Ip() ip?: string
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const clientIp = headers['x-real-ip'] ?? headers['x-forwarded-for']?.split(',')[0]?.trim() ?? ip;
    const userAgent = headers['user-agent'];

    return this.observabilityService.ingestLogFromSdk(
      {
        ...body,
        level: body.level as any,
        status: body.status as any,
        clientIp: (body.metadata?.clientIp as string | undefined) ?? clientIp,
        userAgent: (body.metadata?.userAgent as string | undefined) ?? userAgent
      },
      writeKey
    );
  }
}

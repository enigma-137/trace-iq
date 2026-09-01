import { Body, Controller, Delete, Get, Header, Headers, Logger, Param, Patch, PayloadTooLargeException, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { AuthorizeReplayUploadRequest, IngestReplayChunkRequest, ReplaySettings } from './interfaces/replay.interface';
import { REPLAY_LIMITS } from './replay.constants';
import { ReplayService } from './replay.service';

@Controller('v1/replays')
export class ReplayIngestionController {
  private readonly logger = new Logger(ReplayIngestionController.name);
  constructor(private readonly replays: ReplayService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('config')
  config(
    @Query('projectId') projectId: string,
    @Headers('x-traceiq-write-key') writeKey?: string
  ) {
    return this.replays.getRecorderConfig(writeKey ?? '', projectId);
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('authorize')
  authorize(
    @Body() body: AuthorizeReplayUploadRequest,
    @Headers('x-traceiq-write-key') writeKey?: string
  ) {
    return this.replays.authorizeUpload(writeKey ?? '', body);
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('chunks')
  async ingest(
    @Body() body: IngestReplayChunkRequest,
    @Headers('x-traceiq-replay-token') uploadToken?: string,
    @Headers('content-length') contentLength?: string
  ) {
    const bytes = Number(contentLength ?? 0);
    if (Number.isFinite(bytes) && bytes > REPLAY_LIMITS.maxRequestBytes) {
      throw new PayloadTooLargeException(`Replay request exceeds ${REPLAY_LIMITS.maxRequestBytes} bytes.`);
    }
    this.logger.log(`replay_ingestion_request project=${safeLogId(body.projectId)} bytes=${Number.isFinite(bytes) ? bytes : 0}`);
    try {
      return await this.replays.ingestChunk(uploadToken ?? '', body);
    } catch (error) {
      this.logger.warn(`replay_chunk_rejected project=${safeLogId(body.projectId)} reason=${error instanceof Error ? error.name : 'unknown'}`);
      throw error;
    }
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('complete')
  complete(
    @Body() body: { projectId?: string; sessionId?: string; anonymousId?: string; userId?: string; endedAt?: string },
    @Headers('x-traceiq-replay-token') uploadToken?: string
  ) {
    return this.replays.complete(uploadToken ?? '', body);
  }
}

function safeLogId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : 'invalid';
}

@Controller('v1/dashboard/replays')
export class ReplayDashboardController {
  constructor(private readonly auth: AuthService, private readonly replays: ReplayService) {}

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('anonymousId') anonymousId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'replays:read');
    return this.replays.list(user, { projectId, userId, anonymousId, sessionId, limit, offset });
  }

  @Get('settings')
  async settings(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'replays:read');
    return this.replays.getSettings(user, projectId);
  }

  @Patch('settings')
  async updateSettings(
    @Body() body: Partial<ReplaySettings> & { projectId?: string; acknowledgePrivacyRisk?: boolean },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'replays:write');
    const { projectId, acknowledgePrivacyRisk, ...settings } = body;
    return this.replays.updateSettings(user, projectId, settings, acknowledgePrivacyRisk === true);
  }

  @Get(':id/playback')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async playback(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'replays:read');
    return this.replays.playback(user, id, projectId, cursor, limit);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'replays:write');
    return this.replays.delete(user, id, projectId);
  }
}

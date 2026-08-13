import { Body, Controller, Get, Headers, Ip, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EventsService, IngestEventRequest } from './events.service';

@Controller('v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // Ingestion is the highest-traffic surface; give SDKs generous headroom while
  // still capping abusive single-IP bursts.
  @Throttle({ default: { limit: 1_000, ttl: 60_000 } })
  @Post()
  ingestEvent(
    @Body() body: IngestEventRequest,
    @Headers() headers: Record<string, string | undefined>,
    @Ip() ip?: string
  ) {
    return this.eventsService.ingest(
      {
        ...body,
        writeKey: headers['x-traceiq-write-key'] ?? body.writeKey
      },
      { ip, forwardedFor: headers['x-forwarded-for'], headers }
    );
  }

  @Throttle({ default: { limit: 1_000, ttl: 60_000 } })
  @Post('batch')
  ingestBatch(
    @Body() body: { projectId?: string; writeKey?: string; batch?: IngestEventRequest[] },
    @Headers() headers: Record<string, string | undefined>,
    @Ip() ip?: string
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    return this.eventsService.ingestBatch(writeKey, body.projectId, body.batch, {
      ip,
      forwardedFor: headers['x-forwarded-for'],
      headers
    });
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get('recent')
  async listRecentEvents(
    @Query('projectId') projectId: string,
    @Headers() headers: Record<string, string | undefined>,
    @Query('limit') limit?: string
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? headers.authorization?.replace(/^Bearer\s+/i, '');
    await this.eventsService.authenticateWriteKey(writeKey ?? '', projectId);
    return this.eventsService.listRecentEvents(projectId, limit ? Number(limit) : undefined);
  }
}

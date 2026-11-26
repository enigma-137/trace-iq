import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
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
      {
        ip,
        forwardedFor: headers['x-forwarded-for'],
        realIp: headers['x-real-ip'],
        headers
      }
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
      realIp: headers['x-real-ip'],
      headers
    });
  }

  // Reading events is deliberately not offered here. Write keys ship inside browser
  // bundles, so anything they unlock is public; recent events are served only by the
  // authenticated GET /v1/dashboard/events/recent.
}

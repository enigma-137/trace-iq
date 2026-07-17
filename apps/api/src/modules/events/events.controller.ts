import { Body, Controller, Get, Headers, Ip, Post, Query } from '@nestjs/common';
import { EventsService, IngestEventRequest } from './events.service';

@Controller('v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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

  @Get('recent')
  listRecentEvents(@Query('projectId') projectId: string, @Query('limit') limit?: string) {
    return this.eventsService.listRecentEvents(projectId, limit ? Number(limit) : undefined);
  }
}

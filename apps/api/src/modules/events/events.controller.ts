import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { EventsService, IngestEventRequest } from './events.service';

@Controller('v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  ingestEvent(
    @Body() body: IngestEventRequest,
    @Headers('x-traceiq-write-key') writeKeyHeader?: string
  ) {
    return this.eventsService.ingest({
      ...body,
      writeKey: writeKeyHeader ?? body.writeKey
    });
  }

  @Get('recent')
  listRecentEvents(@Query('projectId') projectId: string, @Query('limit') limit?: string) {
    return this.eventsService.listRecentEvents(projectId, limit ? Number(limit) : undefined);
  }
}

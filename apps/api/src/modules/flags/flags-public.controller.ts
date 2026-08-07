import { Body, Controller, Headers, Post } from '@nestjs/common';
import { FlagsService } from './flags.service';

// Public flag evaluation for SDKs — authenticated with the project write key
// (same as ingestion), not the dashboard session.
@Controller('v1/flags')
export class FlagsPublicController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post('evaluate')
  evaluate(
    @Body() body: { projectId?: string; distinctId?: string; properties?: Record<string, unknown>; writeKey?: string },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    return this.flagsService.evaluate(writeKey, body.projectId, body.distinctId, body.properties);
  }
}

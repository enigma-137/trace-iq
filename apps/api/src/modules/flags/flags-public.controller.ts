import { Body, Controller, Headers, Post } from '@nestjs/common';
import { FlagsService } from './flags.service';

// Public flag evaluation & exposure ingestion for SDKs — authenticated with the project write key
// (same as ingestion), not the dashboard session.
@Controller('v1/flags')
export class FlagsPublicController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post('evaluate')
  evaluate(
    @Body()
    body: {
      projectId?: string;
      distinctId?: string;
      properties?: Record<string, unknown>;
      writeKey?: string;
      environment?: string;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const environment = headers['x-traceiq-environment'] ?? body.environment;
    return this.flagsService.evaluate(writeKey, body.projectId, body.distinctId, body.properties, environment);
  }

  @Post('exposure')
  trackExposure(
    @Body()
    body: {
      projectId?: string;
      writeKey?: string;
      flagKey: string;
      distinctId: string;
      userId?: string;
      anonymousId?: string;
      sessionId?: string;
      enabled: boolean;
      environment?: string;
      revision?: number;
      evaluationReason?: string;
      payloadHash?: string;
      timestamp?: string;
      properties?: Record<string, unknown>;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const environment = headers['x-traceiq-environment'] ?? body.environment;
    return this.flagsService.trackExposure(writeKey, body.projectId, {
      ...body,
      environment
    });
  }
}

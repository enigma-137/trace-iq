import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ExperimentsService, TrackExposureDto } from './experiments.service';

@Controller('v1/experiments')
export class ExperimentsPublicController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  @Post('evaluate')
  evaluate(
    @Body()
    body: {
      projectId?: string;
      writeKey?: string;
      experimentKey?: string;
      distinctId?: string;
      properties?: Record<string, unknown>;
      environment?: string;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const environment = headers['x-traceiq-environment'] ?? body.environment;
    return this.experimentsService.evaluate(
      writeKey,
      body.projectId,
      body.experimentKey,
      body.distinctId,
      body.properties,
      environment
    );
  }

  @Post('exposure')
  trackExposure(
    @Body() body: TrackExposureDto,
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const environment = headers['x-traceiq-environment'] ?? body.environment;
    return this.experimentsService.trackExposure(writeKey, body.projectId, {
      ...body,
      environment
    });
  }
}

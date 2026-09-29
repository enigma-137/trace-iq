import { Body, Controller, Headers, Post } from '@nestjs/common';
import { SubmitSurveyResponseDto, SurveysService } from './surveys.service';

@Controller('v1/surveys')
export class SurveysPublicController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post('eligible')
  getEligible(
    @Body()
    body: {
      projectId?: string;
      writeKey?: string;
      distinctId?: string;
      properties?: Record<string, unknown>;
      eventName?: string;
      environment?: string;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const environment = headers['x-traceiq-environment'] ?? body.environment;
    return this.surveysService.getEligibleSurveys(
      writeKey,
      body.projectId,
      body.distinctId,
      body.properties,
      body.eventName,
      environment
    );
  }

  @Post('impression')
  recordImpression(
    @Body()
    body: {
      projectId?: string;
      writeKey?: string;
      surveyId?: string;
      distinctId?: string;
      userId?: string;
      anonymousId?: string;
      sessionId?: string;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    return this.surveysService.recordImpression(
      writeKey,
      body.projectId,
      body.surveyId,
      body.distinctId,
      body.userId,
      body.anonymousId,
      body.sessionId
    );
  }

  @Post('dismiss')
  recordDismissal(
    @Body()
    body: {
      projectId?: string;
      writeKey?: string;
      surveyId?: string;
      distinctId?: string;
      userId?: string;
      anonymousId?: string;
      sessionId?: string;
    },
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    return this.surveysService.recordDismissal(
      writeKey,
      body.projectId,
      body.surveyId,
      body.distinctId,
      body.userId,
      body.anonymousId,
      body.sessionId
    );
  }

  @Post('response')
  submitResponse(
    @Body() body: SubmitSurveyResponseDto,
    @Headers() headers: Record<string, string | undefined>
  ) {
    const writeKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    return this.surveysService.submitResponse(writeKey, body.projectId, body);
  }
}

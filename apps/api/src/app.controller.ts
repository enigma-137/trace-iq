import { Controller, Get } from '@nestjs/common';
import { appConfig } from './config/app.config';

interface HealthResponse {
  status: 'ok';
  service: 'traceiq-api';
  environment: string;
  timestamp: string;
}

@Controller()
export class AppController {
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'traceiq-api',
      environment: appConfig.environment,
      timestamp: new Date().toISOString()
    };
  }
}

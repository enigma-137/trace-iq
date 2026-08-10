import { Controller, Get } from '@nestjs/common';
import { appConfig } from './config/app.config';
import { DatabaseService } from './database/database.service';

interface HealthResponse {
  status: 'ok';
  service: 'traceiq-api';
  environment: string;
  timestamp: string;
}

interface DatabaseHealthResponse {
  status: 'ok';
  timestamp: string;
}

@Controller()
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'traceiq-api',
      environment: appConfig.environment,
      timestamp: new Date().toISOString()
    };
  }

  @Get('health/db')
  async databaseHealth(): Promise<DatabaseHealthResponse> {
    await this.database.ping();

    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }
}

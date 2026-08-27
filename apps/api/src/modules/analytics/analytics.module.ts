import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AnalyticsController, GoalsController],
  providers: [AnalyticsService, GoalsService],
  exports: [AnalyticsService]
})
export class AnalyticsModule {}

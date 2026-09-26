import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AiModule } from '../ai/ai.module';
import { EmailsModule } from '../emails/emails.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { ErrorsModule } from '../errors/errors.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { DigestService } from './digest.service';
import { SavedInsightsService } from './saved-insights.service';

@Module({
  imports: [AuthModule, ProjectsModule, AiModule, EmailsModule, AnalyticsModule, FunnelsModule, ErrorsModule],
  controllers: [InsightsController],
  providers: [InsightsService, DigestService, SavedInsightsService],
  exports: [DigestService, InsightsService, SavedInsightsService]
})
export class InsightsModule {}
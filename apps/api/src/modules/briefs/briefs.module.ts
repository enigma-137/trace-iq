import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { BillingModule } from '../billing/billing.module';
import { AiModule } from '../ai/ai.module';
import { InsightsModule } from '../insights/insights.module';
import { BriefsController } from './briefs.controller';
import { BriefsScheduler } from './briefs.scheduler';
import { BriefsService } from './briefs.service';
import { ChatDeliveryModule } from './chat-delivery.module';

@Module({
  imports: [AuthModule, ProjectsModule, InsightsModule, BillingModule, ChatDeliveryModule, AiModule],
  controllers: [BriefsController],
  providers: [BriefsService, BriefsScheduler]
})
export class BriefsModule {}

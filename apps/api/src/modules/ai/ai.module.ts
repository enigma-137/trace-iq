import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { ProjectsModule } from '../projects/projects.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CencoriProvider } from './providers/cencori.provider';
import { AiModelPolicyService } from './models/ai-model-policy.service';
import { AiSanitizerService } from './context/ai-sanitizer.service';
import { AiContextService } from './context/ai-context.service';
import { AiRunsService } from './usage/ai-runs.service';

@Module({
  imports: [AuthModule, FunnelsModule, ProjectsModule, DatabaseModule, BillingModule],
  controllers: [AiController],
  providers: [
    AiService,
    CencoriProvider,
    AiModelPolicyService,
    AiSanitizerService,
    AiContextService,
    AiRunsService
  ],
  exports: [AiService, AiSanitizerService, AiModelPolicyService, AiRunsService]
})
export class AiModule {}

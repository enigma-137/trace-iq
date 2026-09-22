import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { ErrorsModule } from '../errors/errors.module';
import { FlagsModule } from '../flags/flags.module';
import { UsersModule } from '../users/users.module';
import { ReplayModule } from '../replay/replay.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProjectsModule } from '../projects/projects.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AskController } from './ask/ask.controller';
import { AskService } from './ask/ask.service';
import { AskOrchestratorService } from './ask/ask-orchestrator.service';
import { ConversationService } from './ask/conversation.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { CencoriProvider } from './providers/cencori.provider';
import { AiModelPolicyService } from './models/ai-model-policy.service';
import { AiSanitizerService } from './context/ai-sanitizer.service';
import { AiContextService } from './context/ai-context.service';
import { AiRunsService } from './usage/ai-runs.service';

@Module({
  imports: [
    AuthModule,
    FunnelsModule,
    ErrorsModule,
    FlagsModule,
    UsersModule,
    ReplayModule,
    WebhooksModule,
    AlertsModule,
    CohortsModule,
    AnalyticsModule,
    ProjectsModule,
    DatabaseModule,
    BillingModule
  ],
  controllers: [AiController, AskController],
  providers: [
    AiService,
    AskService,
    AskOrchestratorService,
    ConversationService,
    ToolRegistryService,
    CencoriProvider,
    AiModelPolicyService,
    AiSanitizerService,
    AiContextService,
    AiRunsService
  ],
  exports: [
    AiService,
    AskService,
    AiSanitizerService,
    AiModelPolicyService,
    AiRunsService,
    ToolRegistryService,
    ConversationService
  ]
})
export class AiModule {}

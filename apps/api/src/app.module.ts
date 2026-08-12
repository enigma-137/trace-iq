import { Module } from '@nestjs/common';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { EventsModule } from './modules/events/events.module';
import { FunnelsModule } from './modules/funnels/funnels.module';
import { CohortsModule } from './modules/cohorts/cohorts.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { FlagsModule } from './modules/flags/flags.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ExportModule } from './modules/export/export.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReplayModule } from './modules/replay/replay.module';
import { UsersModule } from './modules/users/users.module';
import { AiModule } from './modules/ai/ai.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { ErrorsModule } from './modules/errors/errors.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    EventsModule,
    FunnelsModule,
    CohortsModule,
    DashboardsModule,
    AlertsModule,
    FlagsModule,
    WebhooksModule,
    ExportModule,
    AnalyticsModule,
    UsersModule,
    ReplayModule,
    AiModule,
    MfaModule,
    ErrorsModule,
    AchievementsModule,
    BillingModule
  ],
  controllers: [AppController]
})
export class AppModule {}

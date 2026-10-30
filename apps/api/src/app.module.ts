import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProxyAwareThrottlerGuard } from './common/throttler.guard';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { EventsModule } from './modules/events/events.module';
import { FunnelsModule } from './modules/funnels/funnels.module';
import { CohortsModule } from './modules/cohorts/cohorts.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { LinksModule } from './modules/links/links.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { FlagsModule } from './modules/flags/flags.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ExportModule } from './modules/export/export.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { RequestsModule } from './modules/requests/requests.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReplayModule } from './modules/replay/replay.module';
import { UsersModule } from './modules/users/users.module';
import { AiModule } from './modules/ai/ai.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { ErrorsModule } from './modules/errors/errors.module';
import { SourceMapsModule } from './modules/sourcemaps/sourcemaps.module';
import { GroupsModule } from './modules/groups/groups.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { SyntheticMonitoringModule } from './modules/synthetic-monitoring/synthetic-monitoring.module';
import { SetupVerificationsModule } from './modules/setup-verifications/setup-verifications.module';
import { StatusModule } from './modules/status/status.module';
import { AccountLifecycleModule } from './modules/account-lifecycle/account-lifecycle.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { ObservabilityInterceptor } from './common/interceptors/observability.interceptor';

@Module({
  imports: [
    // Baseline per-client request cap (see ProxyAwareThrottlerGuard); individual controllers override with @Throttle.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120
      }
    ]),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    EventsModule,
    SetupVerificationsModule,
    FunnelsModule,
    CohortsModule,
    DashboardsModule,
    AlertsModule,
    FlagsModule,
    LinksModule,
    RevenueModule,
    ExperimentsModule,
    SurveysModule,
    SyntheticMonitoringModule,
    WebhooksModule,
    ExportModule,
    ObservabilityModule,
    RequestsModule,
    AnalyticsModule,
    UsersModule,
    ReplayModule,
    AiModule,
    MfaModule,
    ErrorsModule,
    SourceMapsModule,
    GroupsModule,
    AchievementsModule,
    InsightsModule,
    BillingModule,
    AdminModule,
    StatusModule,
    AccountLifecycleModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ObservabilityInterceptor
    }
  ]
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { EventsModule } from './modules/events/events.module';
import { FunnelsModule } from './modules/funnels/funnels.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReplayModule } from './modules/replay/replay.module';
import { UsersModule } from './modules/users/users.module';
import { AiModule } from './modules/ai/ai.module';
import { ErrorsModule } from './modules/errors/errors.module';
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
    AnalyticsModule,
    UsersModule,
    ReplayModule,
    AiModule,
    ErrorsModule,
    BillingModule
  ],
  controllers: [AppController]
})
export class AppModule {}

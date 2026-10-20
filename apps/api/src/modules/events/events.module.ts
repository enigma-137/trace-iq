import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { SetupVerificationsModule } from '../setup-verifications/setup-verifications.module';
import { RequestsModule } from '../requests/requests.module';
import { ObservabilityModule } from '../observability/observability.module';
import { DashboardEventsController } from './dashboard-events.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, WebhooksModule, AchievementsModule, SetupVerificationsModule, RequestsModule, ObservabilityModule],
  controllers: [EventsController, DashboardEventsController],
  providers: [EventsService],
  exports: [EventsService]
})
export class EventsModule {}

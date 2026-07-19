import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { DashboardEventsController } from './dashboard-events.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, WebhooksModule],
  controllers: [EventsController, DashboardEventsController],
  providers: [EventsService],
  exports: [EventsService]
})
export class EventsModule {}

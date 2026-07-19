import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  // Exported so the ingestion path (EventsModule) can forward events.
  exports: [WebhooksService]
})
export class WebhooksModule {}

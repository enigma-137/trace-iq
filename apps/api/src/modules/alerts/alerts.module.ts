import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { EmailsModule } from '../emails/emails.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { NotificationGroupsController } from './notification-groups.controller';
import { NotificationGroupsService } from './notification-groups.service';

@Module({
  imports: [AuthModule, ProjectsModule, EmailsModule],
  controllers: [AlertsController, NotificationGroupsController],
  providers: [AlertsService, NotificationGroupsService],
  exports: [AlertsService]
})
export class AlertsModule {}

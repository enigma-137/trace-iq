import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { NotificationGroupsController } from './notification-groups.controller';
import { NotificationGroupsService } from './notification-groups.service';
import { EmailService } from './email.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AlertsController, NotificationGroupsController],
  providers: [AlertsService, NotificationGroupsService, EmailService]
})
export class AlertsModule {}

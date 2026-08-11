import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { EmailsModule } from '../emails/emails.module';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

@Module({
  imports: [AuthModule, ProjectsModule, EmailsModule],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  // Exported so the ingestion path (EventsModule) can re-evaluate achievements.
  exports: [AchievementsService]
})
export class AchievementsModule {}

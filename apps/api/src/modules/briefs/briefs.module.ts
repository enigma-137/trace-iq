import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { InsightsModule } from '../insights/insights.module';
import { BriefsController } from './briefs.controller';
import { BriefsScheduler } from './briefs.scheduler';
import { BriefsService } from './briefs.service';
import { SlackClient } from './slack.client';
import { TelegramClient } from './telegram.client';

@Module({
  imports: [AuthModule, ProjectsModule, InsightsModule],
  controllers: [BriefsController],
  providers: [BriefsService, BriefsScheduler, TelegramClient, SlackClient]
})
export class BriefsModule {}

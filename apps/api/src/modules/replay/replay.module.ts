import { Module } from '@nestjs/common';
import { appConfig } from '../../config/app.config';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReplayDashboardController, ReplayIngestionController } from './replay.controller';
import { ReplayRetentionService } from './replay-retention.service';
import { ReplayService } from './replay.service';
import { ReplayTokenService } from './replay-token.service';
import { REPLAY_STORAGE } from './storage/replay-storage.interface';
import { createReplayStorage } from './storage/replay-storage.factory';

@Module({
  imports: [AuthModule, EventsModule, ProjectsModule],
  controllers: [ReplayIngestionController, ReplayDashboardController],
  providers: [
    ReplayService,
    ReplayTokenService,
    ReplayRetentionService,
    {
      provide: REPLAY_STORAGE,
      useFactory: () => createReplayStorage(appConfig.replayStorageDriver)
    }
  ],
  exports: [ReplayService]
})
export class ReplayModule {}

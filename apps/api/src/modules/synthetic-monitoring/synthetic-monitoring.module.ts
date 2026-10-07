import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ObservabilityModule } from '../observability/observability.module';
import { ReplayModule } from '../replay/replay.module';
import { SyntheticMonitoringController } from './synthetic-monitoring.controller';
import { SyntheticCiController } from './synthetic-ci.controller';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';
import { SyntheticRunnerService } from './synthetic-runner.service';
import { SyntheticSchedulerService } from './synthetic-scheduler.service';
import { SyntheticCryptoService } from './synthetic-crypto.service';
import { SyntheticArtifactService } from './synthetic-artifact.service';
import { ReplaySyntheticExtractorService } from './replay-synthetic-extractor.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ProjectsModule,
    ObservabilityModule,
    ReplayModule
  ],
  controllers: [SyntheticMonitoringController, SyntheticCiController],
  providers: [
    SyntheticMonitoringService,
    SyntheticRunnerService,
    SyntheticSchedulerService,
    SyntheticCryptoService,
    SyntheticArtifactService,
    ReplaySyntheticExtractorService
  ],
  exports: [
    SyntheticMonitoringService,
    SyntheticRunnerService,
    SyntheticCryptoService,
    SyntheticArtifactService,
    ReplaySyntheticExtractorService
  ]
})
export class SyntheticMonitoringModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SyntheticMonitoringController } from './synthetic-monitoring.controller';
import { SyntheticCiController } from './synthetic-ci.controller';
import { SyntheticMonitoringService } from './synthetic-monitoring.service';
import { SyntheticRunnerService } from './synthetic-runner.service';
import { SyntheticSchedulerService } from './synthetic-scheduler.service';
import { SyntheticCryptoService } from './synthetic-crypto.service';
import { SyntheticArtifactService } from './synthetic-artifact.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ProjectsModule,
    ObservabilityModule
  ],
  controllers: [SyntheticMonitoringController, SyntheticCiController],
  providers: [
    SyntheticMonitoringService,
    SyntheticRunnerService,
    SyntheticSchedulerService,
    SyntheticCryptoService,
    SyntheticArtifactService
  ],
  exports: [
    SyntheticMonitoringService,
    SyntheticRunnerService,
    SyntheticCryptoService,
    SyntheticArtifactService
  ]
})
export class SyntheticMonitoringModule {}

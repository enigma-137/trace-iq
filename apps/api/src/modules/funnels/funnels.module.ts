import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SyntheticMonitoringModule } from '../synthetic-monitoring/synthetic-monitoring.module';
import { FunnelsController } from './funnels.controller';
import { FunnelsService } from './funnels.service';

@Module({
  imports: [AuthModule, ProjectsModule, SyntheticMonitoringModule],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService]
})
export class FunnelsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService]
})
export class DashboardsModule {}
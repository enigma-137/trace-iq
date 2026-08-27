import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PublicDashboardsController } from './public-dashboards.controller';

@Module({
  imports: [AuthModule, ProjectsModule, AnalyticsModule],
  controllers: [DashboardsController, PublicDashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService]
})
export class DashboardsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RevenueController],
  providers: [RevenueService]
})
export class RevenueModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [CohortsController],
  providers: [CohortsService],
  exports: [CohortsService]
})
export class CohortsModule {}

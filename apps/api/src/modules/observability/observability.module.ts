import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}

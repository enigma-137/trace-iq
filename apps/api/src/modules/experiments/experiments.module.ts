import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ExperimentsController } from './experiments.controller';
import { ExperimentsPublicController } from './experiments-public.controller';
import { ExperimentsService } from './experiments.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ExperimentsController, ExperimentsPublicController],
  providers: [ExperimentsService],
  exports: [ExperimentsService]
})
export class ExperimentsModule {}

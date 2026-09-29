import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SurveysController } from './surveys.controller';
import { SurveysPublicController } from './surveys-public.controller';
import { SurveysService } from './surveys.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [SurveysController, SurveysPublicController],
  providers: [SurveysService],
  exports: [SurveysService]
})
export class SurveysModule {}

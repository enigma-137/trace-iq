import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SourceMapsController } from './sourcemaps.controller';
import { SourceMapsService } from './sourcemaps.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [SourceMapsController],
  providers: [SourceMapsService],
  exports: [SourceMapsService]
})
export class SourceMapsModule {}

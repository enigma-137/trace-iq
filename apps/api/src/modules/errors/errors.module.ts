import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SourceMapsModule } from '../sourcemaps/sourcemaps.module';
import { ErrorsController } from './errors.controller';
import { ErrorsService } from './errors.service';

@Module({
  imports: [AuthModule, ProjectsModule, SourceMapsModule],
  controllers: [ErrorsController],
  providers: [ErrorsService],
  exports: [ErrorsService]
})
export class ErrorsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  // Exported so the ingestion path (EventsModule) can write request records.
  exports: [RequestsService]
})
export class RequestsModule {}

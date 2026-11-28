import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { PublicStatusPagesController, StatusPagesController } from './status-pages.controller';
import { StatusPagesService } from './status-pages.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [StatusPagesController, PublicStatusPagesController],
  providers: [StatusPagesService]
})
export class StatusPagesModule {}

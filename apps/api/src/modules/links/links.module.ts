import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { LinksController } from './links.controller';
import { LinksPublicController } from './links-public.controller';
import { LinksService } from './links.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [LinksController, LinksPublicController],
  providers: [LinksService],
  exports: [LinksService]
})
export class LinksModule {}

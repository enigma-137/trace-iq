import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [GroupsController],
  providers: [GroupsService]
})
export class GroupsModule {}

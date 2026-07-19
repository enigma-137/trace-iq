import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { FlagsController } from './flags.controller';
import { FlagsPublicController } from './flags-public.controller';
import { FlagsService } from './flags.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [FlagsController, FlagsPublicController],
  providers: [FlagsService]
})
export class FlagsModule {}

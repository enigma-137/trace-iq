import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [AuthModule, FunnelsModule, ProjectsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}

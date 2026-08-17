import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AiModule } from '../ai/ai.module';
import { EmailsModule } from '../emails/emails.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { DigestService } from './digest.service';

@Module({
  imports: [AuthModule, ProjectsModule, AiModule, EmailsModule],
  controllers: [InsightsController],
  providers: [InsightsService, DigestService],
  exports: [DigestService, InsightsService]
})
export class InsightsModule {}
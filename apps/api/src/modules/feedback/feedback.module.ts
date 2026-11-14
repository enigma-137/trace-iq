import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminFeedbackController, FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

// In-product feedback and card requests, read by the platform admin inbox.
@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [FeedbackController, AdminFeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService]
})
export class FeedbackModule {}

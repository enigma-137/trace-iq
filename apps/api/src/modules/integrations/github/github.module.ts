import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProjectsModule } from '../../projects/projects.module';
import { GitHubAppClient } from './github-app.client';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubWebhookService } from './github-webhook.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [GitHubController],
  providers: [GitHubAppClient, GitHubService, GitHubWebhookService],
  // Phase 5 (setup PRs) uses the client and the installation/repo lookups.
  exports: [GitHubAppClient, GitHubService]
})
export class GitHubModule {}

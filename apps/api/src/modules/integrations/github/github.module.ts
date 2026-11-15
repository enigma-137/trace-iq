import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProjectsModule } from '../../projects/projects.module';
import { GitHubAppClient } from './github-app.client';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubWebhookService } from './github-webhook.service';
import { GitHubSetupService } from './setup/github-setup.service';
import { GitHubSourceContextService } from './source-context.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [GitHubController],
  providers: [GitHubAppClient, GitHubService, GitHubWebhookService, GitHubSetupService, GitHubSourceContextService],
  // Phase 5 (setup PRs) uses the client and the installation/repo lookups.
  exports: [GitHubAppClient, GitHubService]
})
export class GitHubModule {}

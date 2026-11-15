import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ErrorsModule } from '../../errors/errors.module';
import { ProjectsModule } from '../../projects/projects.module';
import { SyntheticCryptoService } from '../../synthetic-monitoring/synthetic-crypto.service';
import { TokenCipher } from '../common/token-cipher';
import { LinearClient } from './linear.client';
import { LinearController } from './linear.controller';
import { LinearIssuesController } from './linear-issues.controller';
import { LinearIssuesService } from './linear-issues.service';
import { LinearAutoCreateService } from './linear-auto-create.service';
import { LinearWebhookService } from './linear-webhook.service';
import { LinearService } from './linear.service';

@Module({
  imports: [AuthModule, ProjectsModule, ErrorsModule],
  controllers: [LinearController, LinearIssuesController],
  providers: [SyntheticCryptoService, TokenCipher, LinearClient, LinearService, LinearIssuesService, LinearWebhookService, LinearAutoCreateService],
  exports: [LinearClient, LinearService, LinearIssuesService, LinearAutoCreateService]
})
export class LinearModule {}

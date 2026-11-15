import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProjectsModule } from '../../projects/projects.module';
import { SyntheticCryptoService } from '../../synthetic-monitoring/synthetic-crypto.service';
import { TokenCipher } from '../common/token-cipher';
import { LinearClient } from './linear.client';
import { LinearController } from './linear.controller';
import { LinearService } from './linear.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [LinearController],
  providers: [SyntheticCryptoService, TokenCipher, LinearClient, LinearService],
  // Phase 2 (issues from errors) uses the client and the connection lookup.
  exports: [LinearClient, LinearService]
})
export class LinearModule {}

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PersonalAccessTokensController } from './personal-access-tokens.controller';
import { PersonalAccessTokensService } from './personal-access-tokens.service';

@Module({
  controllers: [PersonalAccessTokensController],
  providers: [AuthService, PersonalAccessTokensService],
  exports: [AuthService]
})
export class AuthModule {}


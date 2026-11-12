import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OAuthConsentController, OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [AuthModule],
  controllers: [OAuthController, OAuthConsentController],
  providers: [OAuthService]
})
export class OAuthModule {}

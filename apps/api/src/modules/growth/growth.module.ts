import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GrowthService } from './growth.service';
import { SiteController } from './site.controller';

// Platform growth for the operator console: public-site visitors, sign-ups, sign-ins
// and active users. Not tied to any organization or project.
@Module({
  imports: [AuthModule],
  controllers: [SiteController],
  providers: [GrowthService],
  exports: [GrowthService]
})
export class GrowthModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { ReplayModule } from '../replay/replay.module';
import { AccountLifecycleController } from './account-lifecycle.controller';
import { AccountLifecycleService } from './account-lifecycle.service';

@Module({
  imports: [AuthModule, EmailsModule, ReplayModule],
  controllers: [AccountLifecycleController],
  providers: [AccountLifecycleService]
})
export class AccountLifecycleModule {}

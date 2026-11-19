import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { AdminChangelogDigestController, EmailPreferencesController, EmailUnsubscribeController } from './product-updates.controller';
import { ProductUpdatesService } from './product-updates.service';

// Product-update emails: the monthly changelog digest, opt-outs and unsubscribe links.
@Module({
  imports: [AuthModule, EmailsModule],
  controllers: [EmailPreferencesController, EmailUnsubscribeController, AdminChangelogDigestController],
  providers: [ProductUpdatesService]
})
export class ProductUpdatesModule {}

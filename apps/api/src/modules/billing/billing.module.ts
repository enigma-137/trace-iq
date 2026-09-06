import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { UsageService } from './usage.service';
import { RetentionService } from './retention.service';
import { BachsClient } from './bachs.client';
import { BillingService } from './billing.service';
import { BachsWebhookController } from './bachs-webhook.controller';
import { BillingReturnController } from './billing-return.controller';
import { EmailsModule } from '../emails/emails.module';

@Global()
@Module({
  imports: [EmailsModule],
  controllers: [BachsWebhookController, BillingReturnController],
  providers: [EntitlementService, UsageService, RetentionService, BachsClient, BillingService],
  exports: [EntitlementService, UsageService, RetentionService, BillingService]
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

// Shared Resend transport so any module (alerts, achievements, ...) can send email.
@Module({
  providers: [EmailService],
  exports: [EmailService]
})
export class EmailsModule {}

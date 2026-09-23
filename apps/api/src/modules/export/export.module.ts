import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { EmailsModule } from '../emails/emails.module';
import { ProjectsModule } from '../projects/projects.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [AuthModule, ProjectsModule, BillingModule, EmailsModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService]
})
export class ExportModule {}


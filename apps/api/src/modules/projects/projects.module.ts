import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { EntitlementsController } from './entitlements.controller';
import { BillingController } from './billing.controller';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [ProjectsController, EntitlementsController, BillingController],
  providers: [ProjectsService],
  exports: [ProjectsService]
})
export class ProjectsModule {}

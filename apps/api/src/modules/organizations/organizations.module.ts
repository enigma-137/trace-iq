import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { MembersController } from './members.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsSwitcherController } from './organizations.switcher.controller';

@Module({
  imports: [AuthModule, EmailsModule],
  controllers: [OrganizationsController, MembersController, InvitesController, AuditController, OrganizationsSwitcherController],
  providers: [OrganizationsService, InvitesService, AuditService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}

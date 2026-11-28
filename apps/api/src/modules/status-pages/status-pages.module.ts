import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { ProjectsModule } from '../projects/projects.module';
import { PublicStatusPagesController, StatusPagesController, StatusSubscribersController } from './status-pages.controller';
import { StatusPagesService } from './status-pages.service';
import { StatusSubscribersService } from './status-subscribers.service';

@Module({
  imports: [AuthModule, ProjectsModule, EmailsModule],
  controllers: [StatusPagesController, PublicStatusPagesController, StatusSubscribersController],
  providers: [StatusPagesService, StatusSubscribersService]
})
export class StatusPagesModule {}

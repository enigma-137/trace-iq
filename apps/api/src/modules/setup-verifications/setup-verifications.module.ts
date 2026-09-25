import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { SetupVerificationsController } from './setup-verifications.controller';
import { SetupVerificationsService } from './setup-verifications.service';

@Module({
  imports: [DatabaseModule, AuthModule, ProjectsModule],
  controllers: [SetupVerificationsController],
  providers: [SetupVerificationsService],
  exports: [SetupVerificationsService]
})
export class SetupVerificationsModule {}

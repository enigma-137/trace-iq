import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GrowthModule } from '../growth/growth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, GrowthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService]
})
export class AdminModule {}

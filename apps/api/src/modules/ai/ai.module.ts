import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunnelsModule } from '../funnels/funnels.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AuthModule, FunnelsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}

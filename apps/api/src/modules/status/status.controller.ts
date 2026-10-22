import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StatusService } from './status.service';

@Controller('v1/status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  /**
   * Public, unauthenticated summary for the status page. The dashboard fetches
   * it server-side from a few shared IPs, hence the higher limit.
   */
  @Get()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=30')
  getStatus() {
    return this.status.getPublicStatus();
  }
}

import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { throttleTracker } from '../../common/throttler.guard';
import { GrowthService } from './growth.service';
import { PageviewInput, parsePageview } from './growth.util';

/**
 * The public site's pageview beacon. CORS limits it to the dashboard origins
 * (traceiq.run), and it always answers 204 so it reveals nothing to callers.
 */
@Controller('v1/site')
export class SiteController {
  constructor(private readonly growth: GrowthService) {}

  @Post('pageview')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async pageview(
    @Req() request: Request,
    @Body() body: PageviewInput,
    @Headers('user-agent') userAgent?: string
  ): Promise<void> {
    const pageview = parsePageview(body);
    if (!pageview) return;
    try {
      await this.growth.recordPageview(pageview, throttleTracker(request), userAgent);
    } catch {
      // A missed pageview isn't worth an error for the visitor's browser.
    }
  }
}

import { Controller, Get, Headers, Ip, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { LinksService } from './links.service';

// Called by the dashboard's /l/<slug> route, which forwards the visitor's headers and
// issues the redirect. Not throttled: every request comes from the dashboard server, so
// even a per-client limit would cap clicks for all links together.
@Controller('v1/links')
export class LinksPublicController {
  constructor(private readonly linksService: LinksService) {}

  @SkipThrottle()
  @Get('resolve/:slug')
  resolve(@Param('slug') slug: string, @Ip() ip: string, @Headers() headers: Record<string, string | undefined>) {
    return this.linksService.resolve(slug, {
      userAgent: headers['user-agent'],
      referrer: headers['x-traceiq-referrer'] ?? headers.referer,
      ip,
      forwardedFor: headers['x-forwarded-for'],
      realIp: headers['x-real-ip'],
      headers
    });
  }
}

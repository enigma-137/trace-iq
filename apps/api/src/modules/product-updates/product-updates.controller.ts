import { Body, Controller, Get, Headers, HttpCode, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { ProductUpdatesService } from './product-updates.service';

/** The signed-in person's own email preferences (Settings). */
@Controller('v1/dashboard/me/email-preferences')
export class EmailPreferencesController {
  constructor(
    private readonly authService: AuthService,
    private readonly productUpdates: ProductUpdatesService
  ) {}

  @Get()
  async get(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    if (!user.email) return { email: null, productUpdates: false };
    return { email: user.email, productUpdates: await this.productUpdates.isSubscribed(user.email) };
  }

  @Put()
  async update(@Body() body: { productUpdates?: unknown }, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    if (user.email && typeof body?.productUpdates === 'boolean') {
      await this.productUpdates.setSubscribed(user.email, body.productUpdates);
    }
    return this.get(authorization);
  }
}

/**
 * Unsubscribe from an emailed link, without signing in: the signed token proves the
 * address. The unsubscribe page posts here, and so do mail apps' own one-click
 * "Unsubscribe" buttons (RFC 8058), with the address and token in the query.
 */
@Controller('v1/email')
export class EmailUnsubscribeController {
  constructor(private readonly productUpdates: ProductUpdatesService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribe(@Query('e') queryEmail?: string, @Query('t') queryToken?: string, @Body() body?: { email?: unknown; token?: unknown }) {
    await this.productUpdates.unsubscribeWithToken(body?.email ?? queryEmail, body?.token ?? queryToken);
    return { unsubscribed: true };
  }
}

/** The monthly changelog digest, run from the operator console (/admin). */
@Controller('v1/admin/changelog-digest')
export class AdminChangelogDigestController {
  constructor(
    private readonly authService: AuthService,
    private readonly productUpdates: ProductUpdatesService
  ) {}

  /** Who would get the digest for a month, and whether it has gone out. */
  @Get()
  async status(@Query('period') period: string, @Headers('authorization') authorization?: string) {
    await this.admin(authorization);
    return this.productUpdates.status(period);
  }

  @Post('preview')
  @HttpCode(200)
  async preview(@Body() body: { period: string; entries: unknown }, @Headers('authorization') authorization?: string) {
    await this.admin(authorization);
    return this.productUpdates.preview(body?.period, body?.entries);
  }

  @Post('test')
  @HttpCode(200)
  async test(@Body() body: { period: string; entries: unknown }, @Headers('authorization') authorization?: string) {
    const user = await this.admin(authorization);
    return this.productUpdates.sendTest(body?.period, body?.entries, user.email);
  }

  @Post('send')
  @HttpCode(202)
  async send(@Body() body: { period: string; entries: unknown }, @Headers('authorization') authorization?: string) {
    const user = await this.admin(authorization);
    return this.productUpdates.startSend(body?.period, body?.entries, user.email ?? user.id);
  }

  private async admin(authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    await this.authService.requirePlatformAdmin(user);
    return user;
  }
}

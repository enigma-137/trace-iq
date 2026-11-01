import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { BriefChannelPatch, BriefsService } from './briefs.service';

function secretMatches(received: string | undefined): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('v1')
export class BriefsController {
  constructor(
    private readonly authService: AuthService,
    private readonly briefs: BriefsService
  ) {}

  @Get('dashboard/briefs/telegram')
  async telegram(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:read');
    return this.briefs.getTelegram(user, projectId);
  }

  @Post('dashboard/briefs/telegram/link')
  async link(@Body() body: { projectId?: string; timezone?: unknown }, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:write');
    return this.briefs.createTelegramLink(user, body?.projectId, body?.timezone);
  }

  @Put('dashboard/briefs/channels/:id')
  async update(@Param('id') id: string, @Body() body: BriefChannelPatch, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:write');
    return this.briefs.updateChannel(user, id, body ?? {});
  }

  @Delete('dashboard/briefs/channels/:id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:write');
    return this.briefs.deleteChannel(user, id);
  }

  @Post('dashboard/briefs/channels/:id/test')
  async test(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'analytics:write');
    return this.briefs.sendTest(user, id);
  }

  /** Telegram posts every message to the bot here, signed with the secret set at registration. */
  @Post('integrations/telegram/webhook')
  @HttpCode(200)
  async webhook(@Body() update: unknown, @Headers('x-telegram-bot-api-secret-token') secret?: string) {
    if (!secretMatches(secret)) throw new UnauthorizedException();
    await this.briefs.handleTelegramUpdate((update ?? {}) as Parameters<BriefsService['handleTelegramUpdate']>[0]);
    return { ok: true };
  }
}

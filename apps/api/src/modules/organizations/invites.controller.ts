import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { AcceptInviteRequestBody, CreateInviteRequestBody, InvitesService } from './invites.service';

/**
 * Organization invites. `GET /check/:token` is intentionally unauthenticated —
 * the token itself is the credential and only reveals the org name + invited
 * email. Everything else is owner/admin gated with step-up enforced on writes.
 */
@Controller('v1/organization/invites')
export class InvitesController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitesService: InvitesService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    await this.authService.requireRole(user, ['owner', 'admin']);
    return this.invitesService.listInvites(user);
  }

  @Get('check/:token')
  async check(@Param('token') token: string) {
    return this.invitesService.checkInvite(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Body() body: CreateInviteRequestBody,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    await this.authService.requireRole(user, ['owner', 'admin']);
    return this.invitesService.createInvite(user, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept')
  async accept(
    @Body() body: AcceptInviteRequestBody,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.invitesService.acceptInvite(user, body.token ?? '');
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/resend')
  async resend(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    await this.authService.requireRole(user, ['owner', 'admin']);
    return this.invitesService.resendInvite(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete(':id')
  async cancel(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    await this.authService.requireRole(user, ['owner', 'admin']);
    return this.invitesService.cancelInvite(user, id);
  }
}
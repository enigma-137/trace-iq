import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import {
  AcceptInviteRequestBody,
  AcceptPendingInviteRequestBody,
  CreateInviteRequestBody,
  InvitesService
} from './invites.service';

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

  /**
   * Self-service: pending invites addressed to the caller's email, so a missed
   * pre-auth accept can be completed from the dashboard Team settings.
   */
  @Get('pending')
  async pending(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.invitesService.listPendingInvites(user);
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
  @Post('accept-pending')
  async acceptPending(
    @Body() body: AcceptPendingInviteRequestBody,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    return this.invitesService.acceptPendingInvite(user, body.inviteId ?? '');
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
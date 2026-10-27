import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { AccountLifecycleService } from './account-lifecycle.service';

@Controller('v1/dashboard/lifecycle')
export class AccountLifecycleController {
  constructor(
    private readonly auth: AuthService,
    private readonly lifecycle: AccountLifecycleService
  ) {}

  @Get()
  async status(@Headers('authorization') authorization?: string) {
    const user = await this.auth.getDashboardUser(authorization, { allowPendingDeletion: true });
    this.auth.requireSupabaseSession(user);
    return this.lifecycle.getStatus(user);
  }

  @Get('organizations/:organizationId/export')
  async exportOrganization(
    @Param('organizationId') organizationId: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.exportOrganization(user, organizationId);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('organizations/:organizationId/export/email')
  async emailOrganizationExport(
    @Param('organizationId') organizationId: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.emailOrganizationExport(user, organizationId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('organizations/:organizationId/delete')
  async scheduleOrganizationDeletion(
    @Param('organizationId') organizationId: string,
    @Body() body: { confirmation?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.scheduleOrganizationDeletion(user, organizationId, body?.confirmation ?? '');
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('organizations/:organizationId/cancel')
  async cancelOrganizationDeletion(
    @Param('organizationId') organizationId: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization, { allowPendingDeletion: true });
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.cancelOrganizationDeletion(user, organizationId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('organizations/:organizationId/leave')
  async leaveOrganization(
    @Param('organizationId') organizationId: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.leaveOrganization(user, organizationId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('account/delete')
  async scheduleAccountDeletion(
    @Body() body: { confirmation?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.scheduleAccountDeletion(user, body?.confirmation ?? '');
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('account/cancel')
  async cancelAccountDeletion(@Headers('authorization') authorization?: string) {
    const user = await this.auth.getDashboardUser(authorization, { allowPendingDeletion: true });
    this.auth.requireSupabaseSession(user);
    this.auth.requireStepUpIfEnrolled(user);
    return this.lifecycle.cancelAccountDeletion(user);
  }
}

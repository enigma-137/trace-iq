import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { isValidEmail } from '../emails/email.service';
import { AuthService } from '../auth/auth.service';
import {
  AddMemberRequestBody,
  OrganizationsService,
  UpdateMemberRoleRequestBody
} from './organizations.service';

/**
 * Team membership management. Listing is open to any authenticated member of an
 * organization; every mutation requires an owner/admin session with completed
 * step-up (when the account has MFA enrolled).
 */
@Controller('v1/organization/members')
export class MembersController {
  constructor(
    private readonly authService: AuthService,
    private readonly organizationsService: OrganizationsService
  ) {}

  @Get()
  async listMembers(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.organizationsService.listMembers(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async addMember(
    @Body() body: AddMemberRequestBody,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);

    const email = body.email?.trim().toLowerCase() ?? '';
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('A valid email is required.');
    }

    const resolved = await this.authService.resolveUserByEmail(email);
    if (!resolved) {
      throw new BadRequestException('No TraceIQ account was found for that email.');
    }

    return this.organizationsService.addMember(user, {
      userId: resolved.id,
      email: resolved.email,
      role: body.role
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':userId/role')
  async updateMemberRole(
    @Param('userId') userId: string,
    @Body() body: UpdateMemberRoleRequestBody,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    return this.organizationsService.updateMemberRole(user, userId, body.role);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete(':userId')
  async removeMember(@Param('userId') userId: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    return this.organizationsService.removeMember(user, userId);
  }
}
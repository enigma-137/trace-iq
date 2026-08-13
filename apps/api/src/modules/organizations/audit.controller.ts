import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuditService } from './audit.service';
import { OrganizationsService } from './organizations.service';

@Controller('v1/organization/audit')
export class AuditController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService
  ) {}

  /**
   * Recent member-management and write-key events. Owner/admin only — the
   * trail records who changed whose role and who invited or removed whom.
   */
  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('limit') limit?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    await this.authService.requireRole(user, ['owner', 'admin']);

    const membership = await this.organizationsService.getMembership(user);
    if (!membership) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return {
      events: await this.auditService.listForOrganization(membership.id, parseLimit(limit))
    };
  }
}

function parseLimit(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}
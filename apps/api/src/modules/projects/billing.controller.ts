import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { ProjectsService } from './projects.service';

@Controller('v1/dashboard/billing')
export class BillingController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
    private readonly billing: BillingService
  ) {}

  @Post('checkout')
  async checkout(
    @Body() body: { billingPeriod?: string; projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    const project = await this.requireBillingManager(user, body.projectId);
    if (body.billingPeriod !== 'monthly' && body.billingPeriod !== 'yearly') {
      throw new BadRequestException('billingPeriod must be monthly or yearly.');
    }
    if (!user.email) throw new BadRequestException('A billing email is required.');
    return this.billing.createCheckout({
      organizationId: project.organizationId,
      email: user.email,
      billingPeriod: body.billingPeriod
    });
  }

  @Post('portal')
  async portal(
    @Query('projectId') projectId?: string,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireSupabaseSession(user);
    const project = await this.requireBillingManager(user, projectId);
    return this.billing.createPortal(project.organizationId);
  }

  private async requireBillingManager(user: Awaited<ReturnType<AuthService['getDashboardUser']>>, projectId?: string) {
    const project = await this.projects.requireActiveProject(user, projectId);
    if (project.role !== 'owner' && project.role !== 'admin') {
      throw new ForbiddenException('Only organization owners and admins can manage billing.');
    }
    return project;
  }
}


import { Controller, Get, Query, Redirect } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('v1/billing')
export class BillingReturnController {
  constructor(private readonly billing: BillingService) {}

  @Get('return')
  @Redirect()
  returnToDashboard(@Query('status') status?: string, @Query('projectId') projectId?: string) {
    const result = status === 'success' ? 'success' : 'cancelled';
    const safeProjectId = projectId && /^proj_[A-Za-z0-9_-]+$/.test(projectId) ? projectId : undefined;
    return { url: this.billing.checkoutReturnRedirect(result, safeProjectId), statusCode: 302 };
  }
}

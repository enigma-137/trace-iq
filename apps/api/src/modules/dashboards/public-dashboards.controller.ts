import { Controller, Get, Param } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';

@Controller('v1/public/dashboards')
export class PublicDashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get(':token')
  async view(@Param('token') token: string) {
    return this.dashboards.getPublicShare(token);
  }
}

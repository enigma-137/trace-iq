import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CreateWebhookRequest, UpdateWebhookRequest, WebhooksService } from './webhooks.service';

@Controller('v1/dashboard/webhooks')
export class WebhooksController {
  constructor(
    private readonly authService: AuthService,
    private readonly webhooksService: WebhooksService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Query('projectId') projectId?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.webhooksService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateWebhookRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.webhooksService.create(user, body);
  }

  @Post(':id/test')
  async test(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.webhooksService.test(user, id, projectId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWebhookRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.webhooksService.update(user, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.webhooksService.remove(user, id, projectId);
  }
}

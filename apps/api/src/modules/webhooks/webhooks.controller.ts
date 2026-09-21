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
    this.authService.requireScope(user, 'webhooks:read');
    return this.webhooksService.list(user, projectId);
  }

  @Post()
  async create(@Body() body: CreateWebhookRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    this.authService.requireStepUpIfEnrolled(user);
    return this.webhooksService.create(user, body);
  }

  @Get('deliveries/:deliveryId')
  async getDeliveryDetails(
    @Param('deliveryId') deliveryId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:read');
    return this.webhooksService.getDeliveryDetails(user, deliveryId, projectId);
  }

  @Post('deliveries/:deliveryId/retry')
  async retryDelivery(
    @Param('deliveryId') deliveryId: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    return this.webhooksService.retryDelivery(user, deliveryId, projectId);
  }

  @Get(':id')
  async getWebhook(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:read');
    return this.webhooksService.getWebhook(user, id, projectId);
  }

  @Post(':id/test')
  async test(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    return this.webhooksService.test(user, id, projectId);
  }

  @Post(':id/rotate-secret')
  async rotateSecret(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    this.authService.requireStepUpIfEnrolled(user);
    return this.webhooksService.rotateSecret(user, id, projectId);
  }

  @Get(':id/deliveries')
  async listDeliveries(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('event') event?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:read');
    return this.webhooksService.listDeliveries(user, id, { status, event, limit, offset, projectId });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWebhookRequest,
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    this.authService.requireStepUpIfEnrolled(user);
    return this.webhooksService.update(user, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'webhooks:write');
    return this.webhooksService.remove(user, id, projectId);
  }
}

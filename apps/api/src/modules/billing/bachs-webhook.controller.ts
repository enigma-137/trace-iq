import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService, BachsEvent } from './billing.service';

@Controller('v1/billing/webhooks')
export class BachsWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('bachs')
  @HttpCode(200)
  async receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Body() event: BachsEvent,
    @Headers('x-bachs-timestamp') timestamp?: string,
    @Headers('x-bachs-signature') signature?: string
  ) {
    this.billing.verifySignature(request.rawBody ?? Buffer.alloc(0), timestamp, signature);
    return this.billing.processWebhook(event);
  }
}


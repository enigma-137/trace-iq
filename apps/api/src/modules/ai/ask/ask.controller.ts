import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { AskService, AskTraceIQRequest } from './ask.service';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

@Controller('v1/dashboard/ai')
export class AskController {
  private readonly logger = new Logger(AskController.name);
  private readonly rateLimits = new Map<string, RateLimitBucket>();

  constructor(
    private readonly auth: AuthService,
    private readonly askService: AskService
  ) {}

  private checkRateLimit(key: string) {
    const now = Date.now();
    const bucket = this.rateLimits.get(key);

    if (!bucket || now > bucket.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many Ask TraceIQ requests. Please wait a minute before starting another investigation.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    bucket.count += 1;
  }

  @Post('ask')
  async ask(
    @Body() body: AskTraceIQRequest & { stream?: boolean },
    @Headers('authorization') authorization?: string,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
    @Res() res?: Response
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:read');

    const rateLimitKey = `${user.id}:${body.projectId || 'default'}`;
    this.checkRateLimit(rateLimitKey);

    const requestPayload: AskTraceIQRequest = {
      ...body,
      idempotencyKey: body.idempotencyKey || headerIdempotencyKey || body.clientRequestId
    };

    if (body.stream && res) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let clientDisconnected = false;
      res.on('close', () => {
        clientDisconnected = true;
      });

      try {
        const result = await this.askService.ask(user, requestPayload, (progress) => {
          if (!clientDisconnected) {
            res.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
          }
        });

        if (!clientDisconnected) {
          res.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
          res.end();
        }
      } catch (err: any) {
        if (!clientDisconnected) {
          const status = err?.status || err?.getStatus?.() || 500;
          const message = err?.message || 'Investigation failed.';
          res.write(`event: error\ndata: ${JSON.stringify({ status, message })}\n\n`);
          res.end();
        }
      }
      return;
    }

    const result = await this.askService.ask(user, requestPayload);
    if (res) {
      return res.json(result);
    }
    return result;
  }

  @Get('quota')
  async getQuota(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:read');
    return this.askService.getQuotaStatus(user, projectId);
  }

  @Get('conversations')
  async listConversations(
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:read');
    return this.askService.listConversations(user, projectId);
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Query('projectId') projectId?: string
  ) {
    const user = await this.auth.getDashboardUser(authorization);
    this.auth.requireScope(user, 'analytics:read');
    return this.askService.getConversation(user, id, projectId);
  }
}


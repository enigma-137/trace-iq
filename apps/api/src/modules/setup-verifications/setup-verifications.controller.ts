import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SetupVerificationsService } from './setup-verifications.service';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';

interface CreateVerificationBody {
  projectId?: string;
  writeKey?: string;
  ttlSeconds?: number;
}

@Controller(['v1/setup-verifications', 'api/setup-verifications'])
export class SetupVerificationsController {
  constructor(
    private readonly setupVerifications: SetupVerificationsService,
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService
  ) {}

  @Throttle({ default: { limit: 100, ttl: 60_000 } })
  @Post()
  async createVerification(
    @Body() body: CreateVerificationBody,
    @Headers() headers: Record<string, string | undefined>
  ) {
    const rawWriteKey = headers['x-traceiq-write-key'] ?? body.writeKey;
    const authHeader = headers['authorization'];
    let projectId = body.projectId;

    if (rawWriteKey && projectId) {
      const isValid = await this.setupVerifications.authenticateWriteKey(rawWriteKey, projectId);
      if (!isValid) {
        throw new UnauthorizedException('Invalid writeKey for this project.');
      }
    } else if (authHeader) {
      const user = await this.authService.getDashboardUser(authHeader);
      const project = await this.projectsService.resolveActiveProject(user, projectId);
      if (!project) {
        throw new BadRequestException('Project not found or you do not have access.');
      }
      projectId = project.id;
    } else if (projectId) {
      // In local development or when projectId is given without auth, check if project exists
      // If local auth mode is active, allow creation
      if (process.env.AUTH_MODE !== 'local' && !rawWriteKey) {
        throw new UnauthorizedException('Missing authentication (writeKey or user authorization required).');
      }
    } else {
      throw new BadRequestException('projectId or writeKey is required.');
    }

    const session = await this.setupVerifications.createSession(projectId, body.ttlSeconds);
    return session;
  }

  @Throttle({ default: { limit: 200, ttl: 60_000 } })
  @Get(':verificationId')
  async getVerificationStatus(@Param('verificationId') verificationId: string) {
    const session = await this.setupVerifications.getSession(verificationId);
    if (!session) {
      throw new NotFoundException('Verification session not found.');
    }

    return {
      verificationId: session.id,
      projectId: session.project_id,
      status: session.status,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      verifiedAt: session.verified_at,
      verifiedEventName: session.verified_event_name,
      verifiedMetadata: session.verified_metadata
    };
  }

  /**
   * Server-Sent Events (SSE) stream for live setup verification.
   */
  @Get(':verificationId/events')
  async streamVerificationEvents(
    @Param('verificationId') verificationId: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const session = await this.setupVerifications.getSession(verificationId);
    if (!session) {
      res.status(404).json({ error: 'Verification session not found.' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx)
    res.flushHeaders?.();

    // If session is already verified, emit event immediately and end
    if (session.status === 'verified') {
      res.write(
        `event: verified\ndata: ${JSON.stringify({
          verificationId: session.id,
          projectId: session.project_id,
          status: 'verified',
          verifiedAt: session.verified_at,
          event: {
            name: session.verified_event_name ?? 'traceiq_setup_verified',
            id: session.verified_event_id,
            ...(session.verified_metadata ?? {})
          }
        })}\n\n`
      );
      res.end();
      return;
    }

    if (session.status === 'expired') {
      res.write(
        `event: expired\ndata: ${JSON.stringify({
          verificationId: session.id,
          status: 'expired',
          message: 'Verification session has expired.'
        })}\n\n`
      );
      res.end();
      return;
    }

    // Send initial connection acknowledgment
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        verificationId: session.id,
        projectId: session.project_id,
        status: 'pending',
        expiresAt: session.expires_at
      })}\n\n`
    );

    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(expireTimer);
      unsubscribe();
    };

    // Keepalive heartbeats (comment lines every 15s)
    const heartbeatTimer = setInterval(() => {
      if (isClosed) return;
      res.write(`: heartbeat\n\n`);
    }, 15_000);

    // Timeout timer based on expiration
    const remainingMs = Math.max(new Date(session.expires_at).getTime() - Date.now(), 0);
    const expireTimer = setTimeout(() => {
      if (isClosed) return;
      res.write(
        `event: expired\ndata: ${JSON.stringify({
          verificationId: session.id,
          status: 'expired',
          message: 'Verification session timed out.'
        })}\n\n`
      );
      cleanup();
      res.end();
    }, remainingMs);

    // Subscribe to incoming verification events
    const unsubscribe = this.setupVerifications.subscribeToVerification(
      verificationId,
      (payload) => {
        if (isClosed) return;
        res.write(`event: verified\ndata: ${JSON.stringify(payload)}\n\n`);
        cleanup();
        res.end();
      }
    );

    // Handle client disconnect
    req.on('close', () => {
      cleanup();
    });
  }
}
